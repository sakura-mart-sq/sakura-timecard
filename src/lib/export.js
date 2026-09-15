import { buildBackup, exportStaffSuffix, payrollRows, punchRows, reportTable, staffName } from "./model.js";

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function exportSheet(state, startDate, endDate, staffId = "all") {
  const punchHeaders = ["Date", "Staff", "Staff Code", "Scheduled Staff", "Shift Swap", "Start", "End", "Hours", "Hourly Wage", "Pay"];
  const punchData = punchRows(state, startDate, endDate, staffId).map((row) => [
    row.date,
    row.staff,
    row.staffCode,
    row.scheduled,
    row.swapped,
    row.start,
    row.end,
    row.hours.toFixed(2),
    row.wage.toFixed(2),
    row.pay.toFixed(1),
  ]);
  const payrollHeaders = ["Staff", "Staff Code", "Hours", "Hourly Wage", "Pay"];
  const payrollData = payrollRows(state, startDate, endDate, staffId).map((row) => [
    row.person.name,
    row.person.code,
    row.hours.toFixed(2),
    Number(row.person.wage).toFixed(2),
    row.pay.toFixed(1),
  ]);
  const sections = [
    ["Timecard Records"],
    punchHeaders,
    ...punchData,
    [],
    ["Payroll Summary"],
    payrollHeaders,
    ...payrollData,
  ];
  const csv = sections.map((row) => row.map(csvValue).join(",")).join("\n");
  const suffix = exportStaffSuffix(state, staffId);
  downloadFile(`timecard-${suffix}-${startDate}-to-${endDate}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

export function exportPdf(state, startDate, endDate, staffId = "all") {
  const punches = punchRows(state, startDate, endDate, staffId);
  const payroll = payrollRows(state, startDate, endDate, staffId);
  const target = staffId === "all" ? "全員まとめて" : staffName(state, staffId);
  const report = window.open("", "_blank");
  if (!report) {
    window.alert("PDF保存画面を開けませんでした。ブラウザのポップアップ設定を確認してください。");
    return;
  }

  report.document.write(`
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8">
        <title>Timecard ${startDate} to ${endDate}</title>
        <style>
          @page { size: A4 portrait; margin: 14mm; }
          body { font-family: system-ui, sans-serif; color: #202124; margin: 24px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          h2 { font-size: 18px; margin: 24px 0 8px; }
          p { color: #697077; margin: 0 0 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d9ddd6; padding: 7px; text-align: left; }
          th { background: #f1f3ef; }
        </style>
      </head>
      <body>
        <h1>Timecard Report</h1>
        <p>${startDate} から ${endDate} / ${target}</p>
        <h2>勤務記録</h2>
        ${reportTable(
          ["日付", "担当", "コード", "予定", "交代", "開始", "終了", "時間", "時給", "給与"],
          punches.map((row) => [
            row.date,
            row.staff,
            row.staffCode,
            row.scheduled,
            row.swapped === "Yes" ? "あり" : "なし",
            row.start,
            row.end,
            row.hours.toFixed(2),
            `$${row.wage.toFixed(2)}`,
            `$${row.pay.toFixed(1)}`,
          ]),
        )}
        <h2>給与集計</h2>
        ${reportTable(
          ["スタッフ", "コード", "時間", "時給", "給与"],
          payroll.map((row) => [
            row.person.name,
            row.person.code,
            row.hours.toFixed(2),
            `$${Number(row.person.wage).toFixed(2)}`,
            `$${row.pay.toFixed(1)}`,
          ]),
        )}
      </body>
    </html>
  `);
  report.document.close();
  report.focus();
  report.print();
}

export function exportFullBackup(state) {
  const backup = buildBackup(state);
  const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  downloadFile(`timecard-backup-${stamp}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
}
