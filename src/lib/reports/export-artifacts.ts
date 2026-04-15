import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import type { ExportArtifact, ExportFormat, GameReportDocument } from "@/lib/domain/reports";
import { formatClock } from "@/lib/engine/clock";

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsvReport(report: GameReportDocument) {
  const rows = [
    ["section", "label", "value_1", "value_2", "value_3", "value_4"],
    ["context", "status", report.context.status, report.context.venueLabel, report.context.kickoffAt ?? "", ""],
    ["summary", "final_score", report.finalSummary.score.away, report.finalSummary.score.home, report.finalSummary.totalPlays, report.finalSummary.totalDrives],
    ...report.quarterSummary.map((item) => [
      "quarter",
      `Q${item.quarter}`,
      item.playCount,
      item.awayPoints,
      item.homePoints,
      ""
    ]),
    ...report.driveSummaries.map((drive) => [
      "drive",
      drive.id,
      drive.startFieldPosition,
      drive.endFieldPosition,
      drive.playCount,
      drive.result
    ]),
    ...report.fullTimeline.map((item) => [
      "play",
      item.sequence,
      `Q${item.result.finalState.quarter}`,
      formatClock(item.result.finalState.clockSeconds),
      item.result.finalState.phase,
      item.result.summary
    ])
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function buildWorkbook(report: GameReportDocument) {
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet([
    {
      homeTeam: report.context.homeTeam,
      awayTeam: report.context.awayTeam,
      status: report.context.status,
      kickoffAt: report.context.kickoffAt ?? "",
      venue: report.context.venueLabel,
      finalAway: report.finalSummary.score.away,
      finalHome: report.finalSummary.score.home,
      totalPlays: report.finalSummary.totalPlays,
      totalDrives: report.finalSummary.totalDrives
    }
  ]);

  const playsSheet = XLSX.utils.json_to_sheet(
    report.fullTimeline.map((item) => ({
      sequence: item.sequence,
      quarter: item.result.finalState.quarter,
      clock: formatClock(item.result.finalState.clockSeconds),
      phase: item.result.finalState.phase,
      summary: item.result.summary,
      awayScore: item.result.finalState.score.away,
      homeScore: item.result.finalState.score.home
    }))
  );

  const drivesSheet = XLSX.utils.json_to_sheet(
    report.driveSummaries.map((drive) => ({
      id: drive.id,
      side: drive.side,
      quarter: drive.quarter,
      startFieldPosition: drive.startFieldPosition,
      endFieldPosition: drive.endFieldPosition,
      playCount: drive.playCount,
      yardsGained: drive.yardsGained,
      timeConsumed: formatClock(drive.timeConsumedSeconds),
      result: drive.result
    }))
  );

  const teamStatsSheet = XLSX.utils.json_to_sheet(
    report.teamStats.map((team) => ({
      label: team.label,
      side: team.side,
      ...team.totals
    }))
  );

  const playerStatsSheet = XLSX.utils.json_to_sheet(
    report.playerStats.map((player) => ({
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber,
      side: player.side,
      ...player.totals
    }))
  );

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, playsSheet, "Timeline");
  XLSX.utils.book_append_sheet(workbook, drivesSheet, "Drives");
  XLSX.utils.book_append_sheet(workbook, teamStatsSheet, "Team Stats");
  XLSX.utils.book_append_sheet(workbook, playerStatsSheet, "Player Stats");

  return workbook;
}

async function buildPdfReport(report: GameReportDocument) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([612, 792]);
  let cursorY = 750;

  const writeLine = (text: string, size = 11, isBold = false) => {
    if (cursorY < 72) {
      page = pdf.addPage([612, 792]);
      cursorY = 750;
    }

    page.drawText(text, {
      x: 48,
      y: cursorY,
      size,
      font: isBold ? bold : font,
      color: rgb(0.12, 0.16, 0.15)
    });
    cursorY -= size + 6;
  };

  writeLine("Tracking the Game - Game Report", 18, true);
  writeLine(`${report.context.awayTeam} at ${report.context.homeTeam}`, 14, true);
  writeLine(`Status: ${report.context.status} | Venue: ${report.context.venueLabel}`);
  writeLine(
    `Final score: ${report.finalSummary.score.away}-${report.finalSummary.score.home} | Plays: ${report.finalSummary.totalPlays} | Drives: ${report.finalSummary.totalDrives}`
  );
  writeLine("");
  writeLine("Highlights", 13, true);
  writeLine(`Last score: ${report.highlights.lastScoringSummary ?? "None"}`);
  writeLine(`Last turnover: ${report.highlights.lastTurnoverSummary ?? "None"}`);
  writeLine(`Last penalty: ${report.highlights.lastPenaltySummary ?? "None"}`);
  writeLine("");
  writeLine("Drive summary", 13, true);

  for (const drive of report.driveSummaries.slice(0, 12)) {
    writeLine(
      `Q${drive.quarter} ${drive.side.toUpperCase()} ${drive.startFieldPosition} -> ${drive.endFieldPosition} | ${drive.playCount} plays | ${drive.yardsGained} yards | ${drive.result}`
    );
  }

  writeLine("");
  writeLine("Recent scoring summary", 13, true);
  for (const play of report.scoringSummary.slice(0, 10)) {
    writeLine(
      `Q${play.result.finalState.quarter} ${formatClock(play.result.finalState.clockSeconds)} - ${play.result.summary}`
    );
  }

  return pdf.save();
}

export async function serializeGameReport(
  report: GameReportDocument,
  format: ExportFormat
): Promise<ExportArtifact> {
  switch (format) {
    case "json":
      return {
        fileName: `${report.gameId}-${report.reportType}.json`,
        format,
        contentType: "application/json",
        body: JSON.stringify(report, null, 2)
      };
    case "csv":
      return {
        fileName: `${report.gameId}-${report.reportType}.csv`,
        format,
        contentType: "text/csv",
        body: buildCsvReport(report)
      };
    case "xlsx":
      return {
        fileName: `${report.gameId}-${report.reportType}.xlsx`,
        format,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: XLSX.write(buildWorkbook(report), { bookType: "xlsx", type: "buffer" })
      };
    case "pdf":
      return {
        fileName: `${report.gameId}-${report.reportType}.pdf`,
        format,
        contentType: "application/pdf",
        body: await buildPdfReport(report)
      };
  }
}
