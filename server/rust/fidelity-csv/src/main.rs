use portfolio_fidelity_csv::{parse_fidelity_csv, valid_today};
use serde_json::json;
use std::io::{self, Read, Write};
use std::process::ExitCode;

fn run() -> io::Result<u8> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 2 || args[0] != "--today" || !valid_today(&args[1]) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "expected --today YYYY-MM-DD",
        ));
    }
    let mut csv = String::new();
    io::stdin().read_to_string(&mut csv)?;
    let (result, status) = match parse_fidelity_csv(&csv, &args[1]) {
        Ok(result) => (result, 0),
        Err(error) => (json!({ "error": error }), 2),
    };
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    serde_json::to_writer(&mut stdout, &result)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(status)
}

fn main() -> ExitCode {
    match run() {
        Ok(status) => ExitCode::from(status),
        Err(_) => {
            // Never echo uploaded data, filenames, or account identifiers.
            eprintln!("CSV processor I/O or invocation failed");
            ExitCode::FAILURE
        }
    }
}
