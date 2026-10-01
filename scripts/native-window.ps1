param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [ValidateSet('inspect', 'resize', 'minimize', 'restore', 'close')][string]$Action = 'inspect',
    [int]$Width = 1360,
    [int]$Height = 880
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ValidationWindow {
    public delegate bool EnumProc(IntPtr handle, IntPtr param);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int size);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr handle, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr handle, uint message, IntPtr wparam, IntPtr lparam);
    public static IntPtr Find(int pid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((handle, param) => {
            uint owner; GetWindowThreadProcessId(handle, out owner);
            if (owner == pid && IsWindowVisible(handle)) { found = handle; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
'@
[void][ValidationWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
$handle = [ValidationWindow]::Find($ProcessId)
if ($handle -eq [IntPtr]::Zero) { throw "No visible native window for PID $ProcessId" }
$client = New-Object ValidationWindow+Rect
$outer = New-Object ValidationWindow+Rect
[void][ValidationWindow]::GetClientRect($handle, [ref]$client)
[void][ValidationWindow]::GetWindowRect($handle, [ref]$outer)
$dpi = [ValidationWindow]::GetDpiForWindow($handle)
if ($dpi -eq 0) { throw 'Cannot read window DPI' }
switch ($Action) {
    'resize' {
        $physicalWidth = [int][Math]::Round($Width * $dpi / 96) + ($outer.Right - $outer.Left) - $client.Right
        $physicalHeight = [int][Math]::Round($Height * $dpi / 96) + ($outer.Bottom - $outer.Top) - $client.Bottom
        if (-not [ValidationWindow]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, $physicalWidth, $physicalHeight, 6)) {
            throw 'SetWindowPos failed'
        }
    }
    'minimize' { [void][ValidationWindow]::ShowWindow($handle, 6) }
    'restore' { [void][ValidationWindow]::ShowWindow($handle, 9) }
    'close' {
        if (-not [ValidationWindow]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
            throw 'WM_CLOSE failed'
        }
    }
}
[void][ValidationWindow]::GetClientRect($handle, [ref]$client)
$title = New-Object System.Text.StringBuilder 256
[void][ValidationWindow]::GetWindowText($handle, $title, $title.Capacity)
[PSCustomObject]@{
    pid = $ProcessId
    title = $title.ToString()
    visible = [ValidationWindow]::IsWindowVisible($handle)
    minimized = [ValidationWindow]::IsIconic($handle)
    dpi = $dpi
    width = [Math]::Round($client.Right * 96 / $dpi)
    height = [Math]::Round($client.Bottom * 96 / $dpi)
} | ConvertTo-Json -Compress
