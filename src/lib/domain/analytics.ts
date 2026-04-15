export type AnalyticsTeamSummary = {
  label: string;
  pointsFor: number;
  pointsAgainst: number;
  wins: number;
  losses: number;
  ties: number;
  totalPlays: number;
  totalDrives: number;
};

export type AnalyticsTrendPoint = {
  gameId: string;
  label: string;
  pointsFor: number;
  pointsAgainst: number;
  turnoverMargin: number;
  explosivePlays: number;
  thirdDownConversions: number;
  redZoneTrips: number;
};

export type AnalyticsOpponentHistory = {
  opponentId: string;
  opponentLabel: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  averagePointsFor: number;
  averagePointsAgainst: number;
};

export type SituationalAnalytics = {
  thirdDownAttempts: number;
  thirdDownConversions: number;
  thirdDownRate: number;
  fourthDownAttempts: number;
  fourthDownConversions: number;
  fourthDownRate: number;
  redZoneTrips: number;
  redZoneScores: number;
  redZoneRate: number;
  goalToGoTrips: number;
  goalToGoScores: number;
  goalToGoRate: number;
  turnoversCommitted: number;
  turnoversForced: number;
  explosivePlays: number;
  defensiveStops: number;
  specialTeamsReturnYards: number;
  averageStartingYardLine: number;
  averageDriveYards: number;
};

export type AnalyticsPlayerLeader = {
  playerKey: string;
  label: string;
  stat: string;
  value: number;
};

export type AnalyticsLeaderBucket = {
  title: string;
  stat: string;
  leaders: AnalyticsPlayerLeader[];
};

export type AnalyticsOpponentBreakdown = {
  opponentId: string;
  opponentLabel: string;
  gamesPlayed: number;
  averageMargin: number;
  averageTurnoverMargin: number;
  averageExplosivePlays: number;
  thirdDownRate: number;
  redZoneRate: number;
};

export type AnalyticsPerformanceHighlight = {
  label: string;
  gameId: string;
  opponentLabel: string;
  value: number;
  detail: string;
};

export type AnalyticsPerformanceSummary = {
  bestScoringGame: AnalyticsPerformanceHighlight | null;
  bestDefensiveGame: AnalyticsPerformanceHighlight | null;
  bestDriveEfficiencyGame: AnalyticsPerformanceHighlight | null;
  cleanestGame: AnalyticsPerformanceHighlight | null;
};

export type AnalyticsPlayerTrendPoint = {
  gameId: string;
  label: string;
  value: number;
};

export type AnalyticsPlayerTrendSeries = {
  title: string;
  stat: string;
  players: Array<{
    playerKey: string;
    label: string;
    points: AnalyticsPlayerTrendPoint[];
  }>;
};

export type SeasonAnalyticsDocument = {
  organizationId: string;
  teamId: string;
  seasonId: string;
  seasonLabel: string;
  summary: AnalyticsTeamSummary;
  trends: AnalyticsTrendPoint[];
  opponentHistory: AnalyticsOpponentHistory[];
  opponentBreakdowns: AnalyticsOpponentBreakdown[];
  situational: SituationalAnalytics;
  performance: AnalyticsPerformanceSummary;
  playerLeaders: AnalyticsLeaderBucket[];
  playerTrends: AnalyticsPlayerTrendSeries[];
};
