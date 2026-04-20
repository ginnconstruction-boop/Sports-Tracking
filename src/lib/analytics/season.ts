import type { SeasonAnalyticsDocument } from "@/lib/domain/analytics";
import type { GameReportDocument } from "@/lib/domain/reports";
import type { StatType } from "@/lib/domain/stats";

function percentage(made: number, attempts: number) {
  if (attempts === 0) return 0;
  return Number(((made / attempts) * 100).toFixed(1));
}

function isThirdDown(result: GameReportDocument["fullTimeline"][number]) {
  return result.result.baseResult.metadata.downBeforePlay === 3;
}

function isFourthDown(result: GameReportDocument["fullTimeline"][number]) {
  return result.result.baseResult.metadata.downBeforePlay === 4;
}

function isConverted(result: GameReportDocument["fullTimeline"][number]) {
  return result.result.finalState.down === 1 && !result.result.baseResult.metadata.scoringTeam;
}

function isExplosive(result: GameReportDocument["fullTimeline"][number]) {
  const summary = result.result.summary.toLowerCase();
  const payload = result.result.play.payload as Record<string, unknown>;
  const yards =
    typeof payload.yards === "number"
      ? payload.yards
      : typeof payload.returnYards === "number"
        ? payload.returnYards
        : typeof payload.kickDistance === "number"
          ? payload.kickDistance
          : 0;
  return yards >= 20 || summary.includes("touchdown");
}

function turnoverDelta(report: GameReportDocument) {
  return report.turnoverTracker.reduce(
    (sum, item) => sum + (item.play.possession === "home" ? -1 : 1),
    0
  );
}

function parseFieldPosition(value: string) {
  const match = value.match(/(own|opp)\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const side = match[1].toLowerCase();
  const yardLine = Number(match[2]);
  if (Number.isNaN(yardLine)) {
    return null;
  }

  return side === "own" ? yardLine : 100 - yardLine;
}

function teamStat(
  report: GameReportDocument,
  primarySide: "home" | "away",
  stat: StatType
) {
  return report.stats.teamTotals[primarySide][stat] ?? 0;
}

function totalYards(report: GameReportDocument, primarySide: "home" | "away") {
  return teamStat(report, primarySide, "rushing_yards") + teamStat(report, primarySide, "passing_yards");
}

const leaderStats: Array<{ title: string; stat: StatType }> = [
  { title: "Passing leaders", stat: "passing_yards" },
  { title: "Rushing leaders", stat: "rushing_yards" },
  { title: "Receiving leaders", stat: "receiving_yards" },
  { title: "Tackle leaders", stat: "solo_tackle" },
  { title: "Takeaway leaders", stat: "interception" }
];

const trendStats: Array<{ title: string; stat: StatType }> = [
  { title: "Passing yards trend", stat: "passing_yards" },
  { title: "Rushing yards trend", stat: "rushing_yards" },
  { title: "Receiving yards trend", stat: "receiving_yards" },
  { title: "Tackles trend", stat: "solo_tackle" }
];

export function buildSeasonAnalyticsDocument(params: {
  organizationId: string;
  teamId: string;
  seasonId: string;
  seasonLabel: string;
  reports: Array<{
    gameId: string;
    opponentId: string;
    opponentLabel: string;
    primarySide: "home" | "away";
    report: GameReportDocument;
  }>;
}): SeasonAnalyticsDocument {
  const summary = {
    label: params.seasonLabel,
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    firstDowns: 0,
    totalYards: 0,
    rushingYards: 0,
    passingYards: 0,
    thirdDownAttempts: 0,
    thirdDownConversions: 0,
    redZoneTrips: 0,
    totalPlays: 0,
    totalDrives: 0
  };

  const situational = {
    thirdDownAttempts: 0,
    thirdDownConversions: 0,
    thirdDownRate: 0,
    fourthDownAttempts: 0,
    fourthDownConversions: 0,
    fourthDownRate: 0,
    redZoneTrips: 0,
    redZoneScores: 0,
    redZoneRate: 0,
    goalToGoTrips: 0,
    goalToGoScores: 0,
    goalToGoRate: 0,
    turnoversCommitted: 0,
    turnoversForced: 0,
    explosivePlays: 0,
    defensiveStops: 0,
    specialTeamsReturnYards: 0,
    averageStartingYardLine: 0,
    averageDriveYards: 0
  };

  const opponentMap = new Map<string, SeasonAnalyticsDocument["opponentHistory"][number]>();
  const opponentBreakdownMap = new Map<
    string,
    {
      opponentId: string;
      opponentLabel: string;
      gamesPlayed: number;
      marginSum: number;
      turnoverMarginSum: number;
      explosivePlaySum: number;
      thirdDownAttempts: number;
      thirdDownConversions: number;
      redZoneTrips: number;
      redZoneScores: number;
    }
  >();
  const playerTotals = new Map<string, { label: string; totals: Partial<Record<StatType, number>> }>();
  const playerTrendTotals = new Map<
    string,
    {
      label: string;
      totals: Partial<Record<StatType, number>>;
      byGame: Map<string, { label: string; totals: Partial<Record<StatType, number>> }>;
    }
  >();
  let driveCount = 0;
  let driveYardSum = 0;
  let driveStartYardSum = 0;
  const performance: SeasonAnalyticsDocument["performance"] = {
    bestScoringGame: null,
    bestDefensiveGame: null,
    bestDriveEfficiencyGame: null,
    cleanestGame: null
  };
  const trends = params.reports.map(({ gameId, opponentId, opponentLabel, primarySide, report }) => {
    const pointsFor =
      primarySide === "home" ? report.currentState.score.home : report.currentState.score.away;
    const pointsAgainst =
      primarySide === "home" ? report.currentState.score.away : report.currentState.score.home;
    const firstDowns = teamStat(report, primarySide, "first_down");
    const rushingYards = teamStat(report, primarySide, "rushing_yards");
    const passingYards = teamStat(report, primarySide, "passing_yards");
    const totalOffense = totalYards(report, primarySide);
    const thirdDownAttempts = teamStat(report, primarySide, "third_down_attempt");
    const thirdDownConversions = teamStat(report, primarySide, "third_down_conversion");
    const redZoneTrips = teamStat(report, primarySide, "red_zone_trip");
    const redZoneScores = teamStat(report, primarySide, "red_zone_score");
    const goalToGoTrips = teamStat(report, primarySide, "goal_to_go_trip");
    const goalToGoScores = teamStat(report, primarySide, "goal_to_go_score");

    summary.pointsFor += pointsFor;
    summary.pointsAgainst += pointsAgainst;
    summary.totalPlays += report.fullTimeline.length;
    summary.totalDrives += report.driveSummaries.length;
    summary.firstDowns += firstDowns;
    summary.totalYards += totalOffense;
    summary.rushingYards += rushingYards;
    summary.passingYards += passingYards;
    summary.thirdDownAttempts += thirdDownAttempts;
    summary.thirdDownConversions += thirdDownConversions;
    summary.redZoneTrips += redZoneTrips;
    if (pointsFor > pointsAgainst) summary.wins += 1;
    else if (pointsFor < pointsAgainst) summary.losses += 1;
    else summary.ties += 1;

    const opponentRow =
      opponentMap.get(opponentId) ??
      {
        opponentId,
        opponentLabel,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        averagePointsFor: 0,
        averagePointsAgainst: 0
      };

    opponentRow.gamesPlayed += 1;
    opponentRow.pointsFor += pointsFor;
    opponentRow.pointsAgainst += pointsAgainst;
    if (pointsFor > pointsAgainst) opponentRow.wins += 1;
    if (pointsFor < pointsAgainst) opponentRow.losses += 1;
    opponentMap.set(opponentId, opponentRow);

    const opponentBreakdown =
      opponentBreakdownMap.get(opponentId) ??
      {
        opponentId,
        opponentLabel,
        gamesPlayed: 0,
        marginSum: 0,
        turnoverMarginSum: 0,
        explosivePlaySum: 0,
        thirdDownAttempts: 0,
        thirdDownConversions: 0,
        redZoneTrips: 0,
        redZoneScores: 0
      };

    let fourthDownAttempts = 0;
    let fourthDownConversions = 0;
    let explosivePlays = 0;

    for (const item of report.fullTimeline) {
      if (item.result.play.possession !== primarySide) {
        continue;
      }

      if (isFourthDown(item)) {
        fourthDownAttempts += 1;
        if (isConverted(item)) {
          fourthDownConversions += 1;
        }
      }

      if (isExplosive(item)) {
        explosivePlays += 1;
      }
    }

    situational.thirdDownAttempts += thirdDownAttempts;
    situational.thirdDownConversions += thirdDownConversions;
    situational.fourthDownAttempts += fourthDownAttempts;
    situational.fourthDownConversions += fourthDownConversions;
    situational.redZoneTrips += redZoneTrips;
    situational.redZoneScores += redZoneScores;
    situational.goalToGoTrips += goalToGoTrips;
    situational.goalToGoScores += goalToGoScores;
    situational.explosivePlays += explosivePlays;
    const turnoversCommitted = report.turnoverTracker.filter((item) => item.play.possession === primarySide).length;
    const turnoversForced = report.turnoverTracker.filter((item) => item.play.possession !== primarySide).length;
    situational.turnoversCommitted += turnoversCommitted;
    situational.turnoversForced += turnoversForced;
    situational.defensiveStops += report.driveSummaries.filter(
      (drive) => drive.side !== primarySide && ["punt", "turnover", "downs", "missed_field_goal", "end_of_half"].includes(drive.result)
    ).length;
    situational.specialTeamsReturnYards += report.playerStats
      .filter((player) => player.side === primarySide)
      .reduce((sum, player) => sum + (player.totals.return_yards ?? 0), 0);

    for (const drive of report.driveSummaries) {
      if (drive.side !== primarySide) {
        continue;
      }

      const parsedStart = parseFieldPosition(drive.startFieldPosition);
      if (parsedStart !== null) {
        driveStartYardSum += parsedStart;
      }
      driveCount += 1;
      driveYardSum += drive.yardsGained;
    }

    for (const player of report.playerStats) {
      if (player.side !== primarySide) {
        continue;
      }

      const playerKey = `${player.side}:${player.jerseyNumber ?? "na"}:${player.displayName}`;
      const current =
        playerTotals.get(playerKey) ??
        {
          label: `${player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}${player.displayName}`,
          totals: {}
        };
      const trendCurrent =
        playerTrendTotals.get(playerKey) ??
        {
          label: `${player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}${player.displayName}`,
          totals: {},
          byGame: new Map<string, { label: string; totals: Partial<Record<StatType, number>> }>()
        };
      const gameBucket =
        trendCurrent.byGame.get(gameId) ??
        {
          label: opponentLabel,
          totals: {}
        };

      for (const [stat, value] of Object.entries(player.totals)) {
        if (typeof value !== "number" || value === 0) {
          continue;
        }
        current.totals[stat as StatType] = (current.totals[stat as StatType] ?? 0) + value;
        trendCurrent.totals[stat as StatType] = (trendCurrent.totals[stat as StatType] ?? 0) + value;
        gameBucket.totals[stat as StatType] = (gameBucket.totals[stat as StatType] ?? 0) + value;
      }

      playerTotals.set(playerKey, current);
      trendCurrent.byGame.set(gameId, gameBucket);
      playerTrendTotals.set(playerKey, trendCurrent);
    }

    const turnoverMargin = turnoversForced - turnoversCommitted;
    const driveEfficiency = report.driveSummaries.filter((drive) => drive.side === primarySide).reduce(
      (sum, drive) => sum + drive.yardsGained,
      0
    );
    const penaltiesCommitted = report.penaltyTracker.filter((item) => item.play.possession === primarySide).length;

    opponentBreakdown.gamesPlayed += 1;
    opponentBreakdown.marginSum += pointsFor - pointsAgainst;
    opponentBreakdown.turnoverMarginSum += turnoverMargin;
    opponentBreakdown.explosivePlaySum += explosivePlays;
    opponentBreakdown.thirdDownAttempts += thirdDownAttempts;
    opponentBreakdown.thirdDownConversions += thirdDownConversions;
    opponentBreakdown.redZoneTrips += redZoneTrips;
    opponentBreakdown.redZoneScores += redZoneScores;
    opponentBreakdownMap.set(opponentId, opponentBreakdown);

    if (
      !performance.bestScoringGame ||
      pointsFor > performance.bestScoringGame.value
    ) {
      performance.bestScoringGame = {
        label: "Best scoring game",
        gameId,
        opponentLabel,
        value: pointsFor,
        detail: `${pointsFor} points scored`
      };
    }

    if (
      !performance.bestDefensiveGame ||
      pointsAgainst < performance.bestDefensiveGame.value
    ) {
      performance.bestDefensiveGame = {
        label: "Best defensive game",
        gameId,
        opponentLabel,
        value: pointsAgainst,
        detail: `${pointsAgainst} points allowed`
      };
    }

    if (
      !performance.bestDriveEfficiencyGame ||
      driveEfficiency > performance.bestDriveEfficiencyGame.value
    ) {
      performance.bestDriveEfficiencyGame = {
        label: "Best drive-efficiency game",
        gameId,
        opponentLabel,
        value: driveEfficiency,
        detail: `${driveEfficiency} total drive yards`
      };
    }

    if (
      !performance.cleanestGame ||
      penaltiesCommitted < performance.cleanestGame.value
    ) {
      performance.cleanestGame = {
        label: "Cleanest game",
        gameId,
        opponentLabel,
        value: penaltiesCommitted,
        detail: `${penaltiesCommitted} offensive/live penalties committed`
      };
    }

    return {
      gameId,
      label: opponentLabel,
      pointsFor,
      pointsAgainst,
      firstDowns,
      turnoverMargin: turnoverDelta(report),
      explosivePlays,
      thirdDownAttempts,
      thirdDownConversions,
      redZoneTrips
    };
  });

  for (const opponent of opponentMap.values()) {
    opponent.averagePointsFor = opponent.gamesPlayed > 0 ? Number((opponent.pointsFor / opponent.gamesPlayed).toFixed(1)) : 0;
    opponent.averagePointsAgainst =
      opponent.gamesPlayed > 0 ? Number((opponent.pointsAgainst / opponent.gamesPlayed).toFixed(1)) : 0;
  }

  situational.averageStartingYardLine = driveCount > 0 ? Number((driveStartYardSum / driveCount).toFixed(1)) : 0;
  situational.averageDriveYards = driveCount > 0 ? Number((driveYardSum / driveCount).toFixed(1)) : 0;
  situational.thirdDownRate = percentage(situational.thirdDownConversions, situational.thirdDownAttempts);
  situational.fourthDownRate = percentage(situational.fourthDownConversions, situational.fourthDownAttempts);
  situational.redZoneRate = percentage(situational.redZoneScores, situational.redZoneTrips);
  situational.goalToGoRate = percentage(situational.goalToGoScores, situational.goalToGoTrips);

  const playerLeaders = leaderStats.map(({ title, stat }) => ({
    title,
    stat,
    leaders: [...playerTotals.entries()]
      .map(([playerKey, player]) => ({
        playerKey,
        label: player.label,
        stat,
        value: player.totals[stat] ?? 0
      }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
      .slice(0, 5)
  }));

  const playerTrends = trendStats.map(({ title, stat }) => ({
    title,
    stat,
    players: [...playerTrendTotals.entries()]
      .map(([playerKey, player]) => ({
        playerKey,
        label: player.label,
        total: player.totals[stat] ?? 0,
        points: params.reports.map(({ gameId, opponentLabel }) => ({
          gameId,
          label: opponentLabel,
          value: player.byGame.get(gameId)?.totals[stat] ?? 0
        }))
      }))
      .filter((entry) => entry.total > 0)
      .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
      .slice(0, 3)
      .map(({ total: _total, ...entry }) => entry)
  }));

  const opponentBreakdowns = [...opponentBreakdownMap.values()]
    .map((item) => ({
      opponentId: item.opponentId,
      opponentLabel: item.opponentLabel,
      gamesPlayed: item.gamesPlayed,
      averageMargin: Number((item.marginSum / item.gamesPlayed).toFixed(1)),
      averageTurnoverMargin: Number((item.turnoverMarginSum / item.gamesPlayed).toFixed(1)),
      averageExplosivePlays: Number((item.explosivePlaySum / item.gamesPlayed).toFixed(1)),
      thirdDownRate: percentage(item.thirdDownConversions, item.thirdDownAttempts),
      redZoneRate: percentage(item.redZoneScores, item.redZoneTrips)
    }))
    .sort((left, right) => right.averageMargin - left.averageMargin || left.opponentLabel.localeCompare(right.opponentLabel));

  return {
    organizationId: params.organizationId,
    teamId: params.teamId,
    seasonId: params.seasonId,
    seasonLabel: params.seasonLabel,
    summary,
    trends,
    opponentHistory: [...opponentMap.values()].sort((left, right) =>
      left.opponentLabel.localeCompare(right.opponentLabel)
    ),
    opponentBreakdowns,
    situational,
    performance,
    playerLeaders,
    playerTrends
  };
}
