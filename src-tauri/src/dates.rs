use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};

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

fn last_day_of_month(year: i32, month: u32) -> NaiveDate {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(next_year, next_month, 1).expect("valid next-month date")
        - Duration::days(1)
}

/// Days remaining until the end of the calendar period identified by a
/// `bucket_period` string (as produced by `current_bucket_period` for
/// `this_month`/`this_quarter` — `"2026-07"` or `"2026-Q3"`), relative to
/// `now`. Negative once the period has already ended. `None` for malformed
/// input; there's no period concept for `this_week`/`someday` so callers
/// shouldn't call this for those buckets.
pub fn days_until_period_end(bucket_period: &str, now: DateTime<Utc>) -> Option<i64> {
    let end_date = if let Some((year_str, q_str)) = bucket_period.split_once("-Q") {
        let year: i32 = year_str.parse().ok()?;
        let quarter: u32 = q_str.parse().ok()?;
        if !(1..=4).contains(&quarter) {
            return None;
        }
        last_day_of_month(year, quarter * 3)
    } else {
        let (year_str, month_str) = bucket_period.split_once('-')?;
        let year: i32 = year_str.parse().ok()?;
        let month: u32 = month_str.parse().ok()?;
        last_day_of_month(year, month)
    };

    Some((end_date - now.date_naive()).num_days())
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

    #[test]
    fn days_until_month_end_counts_down_within_the_same_month() {
        let now = Utc.with_ymd_and_hms(2026, 7, 24, 0, 0, 0).unwrap();
        assert_eq!(days_until_period_end("2026-07", now), Some(7));
    }

    #[test]
    fn days_until_month_end_is_negative_once_the_month_has_passed() {
        let now = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap();
        assert_eq!(days_until_period_end("2026-07", now), Some(-32));
    }

    #[test]
    fn days_until_quarter_end_counts_down_within_the_same_quarter() {
        // 2026-Q3 ends 2026-09-30.
        let now = Utc.with_ymd_and_hms(2026, 9, 16, 0, 0, 0).unwrap();
        assert_eq!(days_until_period_end("2026-Q3", now), Some(14));
    }

    #[test]
    fn days_until_quarter_end_is_negative_once_the_quarter_has_passed() {
        let now = Utc.with_ymd_and_hms(2026, 10, 5, 0, 0, 0).unwrap();
        assert_eq!(days_until_period_end("2026-Q3", now), Some(-5));
    }

    #[test]
    fn rejects_malformed_or_out_of_range_period_strings() {
        let now = Utc.with_ymd_and_hms(2026, 7, 5, 12, 0, 0).unwrap();
        assert_eq!(days_until_period_end("not-a-period", now), None);
        assert_eq!(days_until_period_end("2026-Q5", now), None);
    }
}
