//! Native shared-output host for the Tiempio engine protocol.

mod backend;
mod bootstrap;
mod host;
mod realtime;
mod self_test;

use std::env;

/// Runs the native host or its deterministic null-backend verification mode.
#[must_use]
pub fn run_from_environment() -> i32 {
    let mut arguments = env::args_os();
    let _executable = arguments.next();
    match (arguments.next(), arguments.next()) {
        (None, None) => match bootstrap::write_environment_acknowledgement() {
            Ok(()) => host::run_shared_stdio(),
            Err(()) => 78,
        },
        (Some(argument), None) if argument == "--self-test-null" => self_test::run(),
        _ => 64,
    }
}
