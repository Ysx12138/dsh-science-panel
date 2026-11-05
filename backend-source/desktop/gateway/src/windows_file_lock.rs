//! Native file locks; closing the owning file also releases the lock.
use std::fs::File;
pub(crate) fn lock(file: &File) -> std::io::Result<()> {
    file.lock()
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, OpenOptions};
    #[test]
    fn lock_excludes_other_handles_and_is_released_on_drop() {
        let path=std::env::temp_dir().join(format!("dsh-lock-{}",std::process::id()));
        let first=OpenOptions::new().read(true).write(true).create_new(true).open(&path).unwrap();
        let second=OpenOptions::new().read(true).write(true).open(&path).unwrap();
        lock(&first).unwrap();
        assert!(second.try_lock().is_err());
        drop(first);
        second.try_lock().unwrap();
        drop(second);
        fs::remove_file(path).unwrap();
    }
}
