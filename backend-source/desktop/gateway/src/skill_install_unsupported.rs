//! The descriptor-based installer needs a native Windows authority boundary.
//! Reject installation capabilities until that boundary is implemented.
#[derive(Clone, Debug)]
pub(crate) struct AuthorityFenceDescriptor;
impl AuthorityFenceDescriptor {
    pub(crate) fn from_env(_token: &str) -> Result<Self, String> {
        Err("Windows 外部技能安装尚未适配，不能启用技能写入宿主".into())
    }
}
pub fn run_mcp(_args: &[String]) -> Result<(), String> {
    Err("Windows 外部技能安装尚未适配".into())
}
