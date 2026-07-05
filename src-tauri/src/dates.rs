use chrono::{DateTime, Datelike, Utc};

/// Computes the calendar-period identifier for a fuzzy bucket at a given
/// instant (e.g. `this_week` -> `"2026-W27"`). Used to stamp `bucket_period`
/// when a deadline is set, and later reused by Daily Review to detect when a
/// task's stored period has drifted from the current one.
pub fn current_bucket_period(bucket: &str, now: DateTime<Utc>) -> Option<String> {
    match bucket {
        "this_week" => {
            let iso = now.iso_week();
            Some(format!("{}-W{:02}", iso.year(), iso.week()))
        }
        "this_month" => Some(now.format("%Y-%m").to_string()),
        "this_quarter" => {
            let quarter = (now.month() - 1) / 3 + 1;
            Some(format!("{}-Q{}", now.year(), quarter))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn week_period_format() {
        let now = Utc.with_ymd_and_hms(2026, 7, 5, 12, 0, 0).unwrap();
        assert_eq!(
            current_bucket_period("this_week", now),
            Some("2026-W27".into())
        );
    }

    #[test]
    fn month_period_format() {
        let now = Utc.with_ymd_and_hms(2026, 7, 5, 12, 0, 0).unwrap();
        assert_eq!(
            current_bucket_period("this_month", now),
            Some("2026-07".into())
        );
    }

    #[test]
    fn quarter_period_boundaries() {
        let q1 = Utc.with_ymd_and_hms(2026, 3, 31, 23, 59, 0).unwrap();
        let q2 = Utc.with_ymd_and_hms(2026, 4, 1, 0, 0, 0).unwrap();
        assert_eq!(
            current_bucket_period("this_quarter", q1),
            Some("2026-Q1".into())
        );
        assert_eq!(
            current_bucket_period("this_quarter", q2),
            Some("2026-Q2".into())
        );
    }

    #[test]
    fn someday_has_no_period() {
        let now = Utc.with_ymd_and_hms(2026, 7, 5, 12, 0, 0).unwrap();
        assert_eq!(current_bucket_period("someday", now), None);
    }
}
