// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeleteBranchDialog from './DeleteBranchDialog.vue';

afterEach(cleanup);

const branch = { name: 'feature/test', oid: 'a'.repeat(40), isHead: false, isRemote: false };
const remote = { name: 'origin/feature/test', oid: 'b'.repeat(40), isHead: false, isRemote: true };

describe('刪除分支確認', () => {
  it('只有勾選時才要求刪除 origin 分支', async () => {
    const operate = vi.fn().mockResolvedValue(true);
    render(DeleteBranchDialog, { props: { branch, remote, busy: false, operate } });
    expect(operate).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByLabelText('同時刪除 origin/feature/test'));
    await fireEvent.click(screen.getByRole('button', { name: '確認刪除分支' }));
    expect(operate).toHaveBeenCalledWith({
      operation: 'deleteBranch',
      branch: branch.name,
      expectedLocalOid: branch.oid,
      deleteRemote: true,
      oid: remote.oid,
    });
  });
  it('沒有 origin 同名分支時只刪除本機分支', async () => {
    const operate = vi.fn().mockResolvedValue(true);
    render(DeleteBranchDialog, { props: { branch, busy: false, operate } });
    expect(
      (screen.getByLabelText('同時刪除 origin/feature/test') as HTMLInputElement).disabled,
    ).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: '確認刪除分支' }));
    expect(operate).toHaveBeenCalledWith({
      operation: 'deleteBranch',
      branch: branch.name,
      expectedLocalOid: branch.oid,
      deleteRemote: false,
    });
  });
});
