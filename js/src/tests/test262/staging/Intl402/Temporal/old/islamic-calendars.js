// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2023 Justin Grant. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal-intl
description: Islamic calendars (note there are 5 variants)
features: [Temporal]
---*/

// Test data obtained from ICU

const tests = [
  {
    calendar: "islamic",
    inLeapYear: false,
    daysInYear: 354,
    daysInMonth12: 29,
    isoDate: "2023-07-18",
  },
  {
    calendar: "islamic-umalqura",
    inLeapYear: false,
    daysInYear: 354,
    daysInMonth12: 30,
    isoDate: "2023-07-19",
  },
  {
    calendar: "islamic-civil",
    inLeapYear: true,
    daysInYear: 355,
    daysInMonth12: 30,
    isoDate: "2023-07-19",
  },
  {
    calendar: "islamic-rgsa",
    inLeapYear: false,
    daysInYear: 354,
    daysInMonth12: 29,
    isoDate: "2023-07-18",
  },
  {
    calendar: "islamic-tbla",
    inLeapYear: true,
    daysInYear: 355,
    daysInMonth12: 30,
    isoDate: "2023-07-18",
  }
];

for (const test of tests) {
  const { calendar, inLeapYear, daysInYear, daysInMonth12, isoDate } = test;
  const year = 1445;
  const date = Temporal.PlainDate.from({ year, month: 1, day: 1, calendar });
  assert.sameValue(date.calendarId, calendar);
  assert.sameValue(date.year, year);
  assert.sameValue(date.month, 1);
  assert.sameValue(date.monthCode, "M01");
  assert.sameValue(date.day, 1);
  assert.sameValue(date.inLeapYear, inLeapYear);
  assert.sameValue(date.daysInYear, daysInYear);
  assert.sameValue(date.monthsInYear, 12);
  assert.sameValue(date.dayOfYear, 1);
  const startOfNextYear = date.with({ year: year + 1 });
  const lastDayOfThisYear = startOfNextYear.subtract({ days: 1 });
  assert.sameValue(lastDayOfThisYear.dayOfYear, daysInYear);
  const dateMonth12 = date.with({ month: 12 });
  assert.sameValue(dateMonth12.daysInMonth, daysInMonth12);
  assert.sameValue(date.toString(), `${isoDate}[u-ca=${calendar}]`, "ISO reference date");
}

reportCompare(0, 0);
