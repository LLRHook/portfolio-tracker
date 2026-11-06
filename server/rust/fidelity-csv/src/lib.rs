use serde_json::{json, Value};
use std::collections::HashSet;

// Match ECMAScript String.trim/\s, including BOM but excluding U+0085.
fn js_space(ch: char) -> bool {
    matches!(ch, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' |
        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
        '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn trim(text: &str) -> &str {
    text.trim_matches(js_space)
}

fn parse_records(text: &str) -> Result<Vec<Vec<String>>, String> {
    let mut records = Vec::new();
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut closed_quote = false;
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if quoted {
            if ch == '"' && chars.peek() == Some(&'"') {
                field.push('"');
                chars.next();
            } else if ch == '"' {
                quoted = false;
                closed_quote = true;
            } else {
                field.push(ch);
            }
        } else if matches!(ch, ',' | '\n' | '\r') {
            fields.push(trim(&field).to_owned());
            field.clear();
            closed_quote = false;
            if ch != ',' {
                records.push(std::mem::take(&mut fields));
                if ch == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
            }
        } else if ch == '"' && trim(&field).is_empty() && !closed_quote {
            field.clear();
            quoted = true;
        } else if (closed_quote && !js_space(ch)) || ch == '"' {
            return Err("Invalid quoted field in CSV".into());
        } else {
            field.push(ch);
        }
    }
    if quoted {
        return Err("Unterminated quoted field in CSV".into());
    }
    if !field.is_empty() || !fields.is_empty() {
        fields.push(trim(&field).to_owned());
        records.push(fields);
    }
    Ok(records)
}

fn digits(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|ch| ch.is_ascii_digit())
}

fn valid_decimal(text: &str) -> bool {
    let unsigned = text.strip_prefix(['+', '-']).unwrap_or(text);
    let (integer, fraction) = match unsigned.split_once('.') {
        Some((integer, fraction)) => {
            if !fraction.bytes().all(|ch| ch.is_ascii_digit()) {
                return false;
            }
            (integer, Some(fraction))
        }
        None => (unsigned, None),
    };
    if integer.is_empty() {
        return fraction.is_some_and(digits);
    }
    let mut groups = integer.split(',');
    let first = groups.next().unwrap_or("");
    if !digits(first) {
        return false;
    }
    if integer.contains(',') {
        first.len() <= 3 && groups.all(|group| group.len() == 3 && digits(group))
    } else {
        true
    }
}

fn parse_number(
    value: &str,
    column: &str,
    row: usize,
    required: bool,
) -> Result<Option<f64>, String> {
    let mut text = trim(value);
    if text.is_empty() || text == "--" || text.eq_ignore_ascii_case("n/a") {
        return if required {
            Err(format!("Missing {column} in CSV row {row}"))
        } else {
            Ok(None)
        };
    }
    let negative = text.starts_with('(') && text.ends_with(')');
    if negative {
        text = &text[1..text.len() - 1];
    }
    text = text.strip_prefix('$').unwrap_or(text);
    let normalized = if text.starts_with("+$") || text.starts_with("-$") {
        format!("{}{}", &text[..1], &text[2..])
    } else {
        text.to_owned()
    };
    let invalid = || format!("Invalid {column} in CSV row {row}");
    if !valid_decimal(&normalized) || (negative && normalized.starts_with(['+', '-'])) {
        return Err(invalid());
    }
    let number = normalized
        .replace(',', "")
        .parse::<f64>()
        .map_err(|_| invalid())?
        * if negative { -1.0 } else { 1.0 };
    if !number.is_finite() {
        return Err(invalid());
    }
    Ok(Some(number))
}

fn word(ch: u8) -> bool {
    ch.is_ascii_alphanumeric() || ch == b'_'
}

fn prefix_word(text: &str, prefix: &str) -> bool {
    text.starts_with(prefix)
        && !text
            .as_bytes()
            .get(prefix.len())
            .is_some_and(|ch| word(*ch))
}

fn find_word<'a>(text: &'a str, needle: &str) -> Option<&'a str> {
    text.match_indices(needle).find_map(|(offset, _)| {
        let before = offset.checked_sub(1).and_then(|i| text.as_bytes().get(i));
        let after = text.as_bytes().get(offset + needle.len());
        if !before.is_some_and(|ch| word(*ch)) && !after.is_some_and(|ch| word(*ch)) {
            Some(&text[offset + needle.len()..])
        } else {
            None
        }
    })
}

fn is_footer(fields: &[String]) -> bool {
    let first = fields
        .first()
        .map_or("", String::as_str)
        .to_ascii_lowercase();
    if first.starts_with("**")
        || prefix_word(&first, "the data and information")
        || prefix_word(&first, "date downloaded")
    {
        return true;
    }
    let line = first
        .split(['\n', '\r', '\u{2028}', '\u{2029}'])
        .next()
        .unwrap_or("");
    prefix_word(line, "this")
        && find_word(line, "export").is_some_and(|rest| find_word(rest, "informational").is_some())
}

fn valid_date(year: u32, month: u32, day: u32) -> bool {
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    day > 0 && day <= days
}

fn snapshot_date(text: &str, today: &str) -> Result<String, String> {
    let lower = text.to_ascii_lowercase();
    let mut last = None;
    // Preserve the existing whole-export search and last matching date policy.
    for (offset, _) in lower.match_indices("date downloaded") {
        let rest = &lower[offset + "date downloaded".len()..];
        let date = rest.trim_start_matches(js_space);
        if date.len() == rest.len() {
            continue;
        }
        let bytes = date.as_bytes();
        if bytes.len() >= 11
            && bytes[..3].iter().all(|ch| word(*ch))
            && bytes[3] == b'-'
            && bytes[4..6].iter().all(u8::is_ascii_digit)
            && bytes[6] == b'-'
            && bytes[7..11].iter().all(u8::is_ascii_digit)
        {
            last = Some(&date[..11]);
        }
    }
    let Some(date) = last else {
        return Ok(today.to_owned());
    };
    let month = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ]
    .iter()
    .position(|m| *m == &date[..3])
    .map_or(0, |i| i as u32 + 1);
    let day = date[4..6].parse::<u32>().unwrap_or(0);
    let year = date[7..11].parse::<u32>().unwrap_or(0);
    if !valid_date(year, month, day) {
        return Err("Invalid snapshot date in CSV footer".into());
    }
    Ok(format!("{year:04}-{month:02}-{day:02}"))
}

pub fn valid_today(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[8..].iter().all(u8::is_ascii_digit)
        && valid_date(
            text[..4].parse().unwrap_or(0),
            text[5..7].parse().unwrap_or(0),
            text[8..].parse().unwrap_or(0),
        )
}

fn nullable(text: &str) -> Option<&str> {
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

pub fn parse_fidelity_csv(csv: &str, today: &str) -> Result<Value, String> {
    let records = parse_records(csv.strip_prefix('\u{feff}').unwrap_or(csv))?;
    let headers: Vec<String> = records.first().map_or_else(Vec::new, |record| {
        record.iter().map(|h| trim(h).to_lowercase()).collect()
    });
    let index = |name: &str| headers.iter().position(|h| h == name);
    for name in ["Account Number", "Symbol", "Quantity", "Current Value"] {
        if index(&name.to_ascii_lowercase()).is_none() {
            return Err(format!("Missing required CSV column: {name}"));
        }
    }
    if headers.iter().collect::<HashSet<_>>().len() != headers.len() {
        return Err("Duplicate column in CSV header".into());
    }
    let mut holdings = Vec::new();
    let mut positions = HashSet::new();
    // Resolve indices once per file, rather than searching headers per cell/row.
    let columns: Vec<_> = [
        "account number",
        "symbol",
        "quantity",
        "current value",
        "last price",
        "average cost basis",
        "last price change",
        "account name",
        "description",
    ]
    .map(index)
    .into();
    for (offset, fields) in records.iter().skip(1).enumerate() {
        if is_footer(fields) {
            continue;
        }
        let cell = |column: usize| {
            columns[column]
                .and_then(|i| fields.get(i))
                .map_or("", String::as_str)
        };
        let raw_symbol = cell(1);
        if raw_symbol.is_empty()
            || raw_symbol.starts_with("**")
            || raw_symbol.eq_ignore_ascii_case("symbol")
        {
            continue;
        }
        let row = offset + 2;
        if fields.len() != headers.len() {
            return Err(format!("Unexpected column count in CSV row {row}"));
        }
        let account = cell(0);
        if account.is_empty()
            || !account
                .bytes()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-')
        {
            return Err(format!("Invalid Account Number in CSV row {row}"));
        }
        let symbol = raw_symbol.trim_end_matches('*');
        let mut quantity = parse_number(cell(2), "Quantity", row, false)?;
        let current_value = parse_number(cell(3), "Current Value", row, true)?.unwrap();
        let mut current_price = parse_number(cell(4), "Last Price", row, false)?;
        let mut cost_basis = parse_number(cell(5), "Average Cost Basis", row, false)?;
        let last_price_change =
            parse_number(cell(6), "Last Price Change", row, false)?.unwrap_or(0.0);
        let cash_quantity =
            quantity.is_none() || quantity == Some(0.0) || raw_symbol.ends_with("**");
        if cash_quantity && current_price.is_none() && current_value > 0.0 {
            quantity = Some(1.0);
            current_price = Some(current_value);
            cost_basis = Some(current_value);
        } else if quantity.is_none() || quantity == Some(0.0) {
            return Err(format!("Missing or zero Quantity in CSV row {row}"));
        }
        let account_name = nullable(cell(7));
        if !positions.insert((symbol.to_owned(), account_name.map(str::to_owned))) {
            return Err(format!("Duplicate position in CSV row {row}"));
        }
        holdings.push(json!({
            "symbol": symbol,
            "description": nullable(cell(8)),
            "quantity": quantity,
            "costBasis": cost_basis,
            "currentPrice": current_price,
            "lastPriceChange": last_price_change,
            "currentValue": current_value,
            "accountName": account_name,
        }));
    }
    Ok(json!({ "holdings": holdings, "snapshotDate": snapshot_date(csv, today)? }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quoting_and_record_numbers() {
        assert_eq!(
            parse_records("a,b\r\n \"one,\"\"two\"\"\nthree\" ,x\r\n").unwrap(),
            vec![vec!["a", "b"], vec!["one,\"two\"\nthree", "x"]]
        );
        assert_eq!(
            parse_records("a\"b").unwrap_err(),
            "Invalid quoted field in CSV"
        );
        assert_eq!(
            parse_records("\"a").unwrap_err(),
            "Unterminated quoted field in CSV"
        );
    }

    #[test]
    fn numeric_grammar_and_finite_range() {
        for (input, expected) in [
            ("($1,234.56)", -1234.56),
            ("+$8", 8.0),
            (".125", 0.125),
            ("1.", 1.0),
            ("$+$8", 8.0),
        ] {
            assert_eq!(
                parse_number(input, "Quantity", 3, true).unwrap(),
                Some(expected)
            );
        }
        for input in [
            "1,23", "1e2", "NaN", "Infinity", "(+1)", "1%", "1.2.3", "1 2", "−1",
        ] {
            assert_eq!(
                parse_number(input, "Quantity", 3, true).unwrap_err(),
                "Invalid Quantity in CSV row 3"
            );
        }
        assert!(parse_number(&"9".repeat(400), "Quantity", 3, true).is_err());
        assert_eq!(parse_number("n/A", "Price", 3, false).unwrap(), None);
        assert_eq!(
            parse_number("--", "Current Value", 3, true).unwrap_err(),
            "Missing Current Value in CSV row 3"
        );
    }

    #[test]
    fn dates_keep_last_match_and_calendar_rules() {
        assert_eq!(
            snapshot_date(
                "Date downloaded Jan-01-2000\nDATE DOWNLOADED\u{feff}Feb-29-2024",
                "2026-11-06"
            )
            .unwrap(),
            "2024-02-29"
        );
        assert_eq!(
            snapshot_date("Date downloaded Feb-31-2026", "2026-11-06").unwrap_err(),
            "Invalid snapshot date in CSV footer"
        );
        assert_eq!(
            snapshot_date("Date downloaded January-01-2026", "2026-11-06").unwrap(),
            "2026-11-06"
        );
        assert!(valid_today("0000-02-29"));
        for input in [
            "2026-02-29",
            "2026-13-01",
            "2026-01-00",
            "2026-1-01",
            "２０２６-01-01",
        ] {
            assert!(!valid_today(input));
        }
    }

    #[test]
    fn full_file_cash_duplicates_and_row_errors() {
        let header = "Account Number,Symbol,Quantity,Current Value";
        let input = format!("\u{feff}{header}\nX-1,SPAXX**,,$1.25\nDate downloaded Oct-21-2026");
        let parsed = parse_fidelity_csv(&input, "2026-11-06").unwrap();
        assert_eq!(parsed["holdings"][0]["symbol"], "SPAXX");
        assert_eq!(parsed["holdings"][0]["costBasis"], 1.25);
        assert_eq!(parsed["snapshotDate"], "2026-10-21");
        assert_eq!(
            parse_fidelity_csv(&format!("{header}\nA,TEST,1,2\nB,TEST,1,2"), "2026-11-06")
                .unwrap_err(),
            "Duplicate position in CSV row 3"
        );
        assert_eq!(
            parse_fidelity_csv(&format!("{header}\nA,TEST,1"), "2026-11-06").unwrap_err(),
            "Unexpected column count in CSV row 2"
        );
    }

    #[test]
    fn footer_recognition_preserves_word_and_line_boundaries() {
        for first in [
            "This export is informational",
            "THE DATA AND INFORMATION, more",
            "** footnote",
            "Date downloaded Oct-21-2026",
        ] {
            assert!(is_footer(&[first.into()]));
        }
        for first in [
            "This exporter is informational",
            "This export\nis informational",
            "The data and informational",
            "Date downloadedX",
        ] {
            assert!(!is_footer(&[first.into()]));
        }
        assert_eq!(trim("\u{feff}\u{a0}a\u{3000}"), "a");
        assert_eq!(trim("\u{85}a\u{85}"), "\u{85}a\u{85}");
    }
}
