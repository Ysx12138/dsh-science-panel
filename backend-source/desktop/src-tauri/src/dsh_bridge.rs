//! Private, parent-owned newline JSON control channel for DSH Science Panel.
//! The parent is responsible for protecting stdin/stdout and for validation.
//! No network listener is exposed and secrets are never echoed or logged.
use std::io::{BufRead, Write};
use serde_json::{json, Value};
use tauri::Manager;
use crate::{commands, config, SharedAppState, SharedLifecycle};

fn execute(app: &tauri::AppHandle, request: Value) -> Result<Value, String> {
    match request.get("command").and_then(Value::as_str) {
        Some("configure_start") => {
            let text = |name: &str| request.get(name).and_then(Value::as_str).filter(|v| !v.is_empty()).ok_or_else(|| format!("missing {name}"));
            let base = text("base_url")?;
            let model = text("model")?;
            let key = text("key")?;
            let requested_proxy = request.get("proxy_port").and_then(Value::as_u64).and_then(|n|u16::try_from(n).ok()).ok_or("invalid proxy port")?;
            let requested_science = request.get("science_port").and_then(Value::as_u64).and_then(|n|u16::try_from(n).ok()).ok_or("invalid Science port")?;
            config::validate_runtime_ports(requested_proxy, requested_science)?;
            // Private to this DSH-specific app. Existing CSSwitch data is untouched.
            let dir = config::default_dir();
            let cfg=config::load_from(&dir).map_err(|_| "cannot read backend settings")?;
            let science;
            if let Some(existing)=cfg.active_profile() {
                science=cfg.sandbox_port;
                if existing.template_id!="custom" {return Err("unexpected provider profile".into());}
                if existing.base_url!=base || existing.model!=model || existing.api_key!=key {
                    tauri::async_runtime::block_on(commands::profiles::update_profile_connection(app.clone(),app.state::<SharedLifecycle>(),existing.id.clone(),Some(base.into()),Some("anthropic".into()),Some(model.into()),Some(key.into()),None,None,None)).map_err(|_| "cannot update provider")?;
                }
            } else {
                science=requested_science;
                config::update(&dir, |cfg| {cfg.proxy_port=requested_proxy;cfg.sandbox_port=science;}).map_err(|_| "cannot initialize backend settings")?;
                let profile=commands::profiles::create_profile(app.state::<SharedLifecycle>(),"custom".into(),"DSH Science".into(),Some(key.into()),Some(base.into()),Some(model.into()),None,None,None)?;
                tauri::async_runtime::block_on(commands::profiles::set_active_profile(app.state::<SharedAppState>(),app.state::<SharedLifecycle>(),profile)).map_err(|_| "cannot select provider")?;
            }
            // Verify the durable active profile before starting a runtime.
            let applied=config::load_from(&dir).map_err(|_| "cannot verify provider settings")?;
            let selected=applied.active_profile().ok_or("no active provider")?;
            if selected.template_id!="custom" || selected.base_url!=base || selected.model!=model || selected.api_key!=key {
                return Err("provider settings were not applied".into());
            }
            let result=tauri::async_runtime::block_on(commands::runtime::one_click_login(app.clone(),app.state::<SharedAppState>(),app.state::<SharedLifecycle>(),None)).map_err(|_| "Science startup failed")?;
            if result.get("status").and_then(Value::as_str)!=Some("ok") {
                let stage=result.get("stage").and_then(Value::as_str).unwrap_or("startup");
                let message=result.get("message").or_else(||result.get("msg")).and_then(Value::as_str).unwrap_or("Science did not start successfully");
                return Err(format!("{stage}: {message}"));
            }
            let consumer=commands::runtime::finalize_consumer_state(result)?;
            if consumer.get("disposition").and_then(Value::as_str)!=Some("ready") {return Err("Science startup not confirmed".into());}
            Ok(json!({"status":"started","science_port":science}))
        }
        Some("stop") => {
            tauri::async_runtime::block_on(commands::runtime::stop_all(app.clone(),app.state::<SharedAppState>(),app.state::<SharedLifecycle>())).map_err(|_| "failed to stop backend")?;
            Ok(json!({"status":"stopped"}))
        }
        _ => Err("unsupported command".into()),
    }
}

pub(crate) fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let stdin=std::io::stdin();
        let mut stdout=std::io::stdout().lock();
        for line in stdin.lock().lines() {
            let line=match line {Ok(line) if line.len()<=16384 => line,_ => break};
            let response=match serde_json::from_str::<Value>(&line) {
                Ok(request) => match execute(&app,request) {Ok(value)=>json!({"ok":true,"result":value}),Err(message)=>json!({"ok":false,"error":message})},
                Err(_)=>json!({"ok":false,"error":"invalid request"}),
            };
            if writeln!(stdout,"DSH_SCIENCE_RESULT:{response}").and_then(|_|stdout.flush()).is_err(){break;}
        }
        let _=tauri::async_runtime::block_on(commands::runtime::stop_all(app.clone(),app.state::<SharedAppState>(),app.state::<SharedLifecycle>()));
        app.exit(0);
    });
}
