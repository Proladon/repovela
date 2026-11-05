use std::time::Instant;

/// Opt-in timing diagnostics. Labels never contain repository paths or Git arguments.
pub(crate) struct Span {
    label: &'static str,
    start: Option<Instant>,
}

impl Span {
    pub(crate) fn new(label: &'static str) -> Self {
        Self {
            label,
            start: (std::env::var_os("REPOVELA_PERF").as_deref()
                == Some(std::ffi::OsStr::new("1")))
            .then(Instant::now),
        }
    }
}

impl Drop for Span {
    fn drop(&mut self) {
        if let Some(start) = self.start {
            eprintln!(
                "[repovela-perf] {:?} {} {:.1} ms",
                std::thread::current().id(),
                self.label,
                start.elapsed().as_secs_f64() * 1000.0
            );
        }
    }
}
