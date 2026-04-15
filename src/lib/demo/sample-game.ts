import type { PlayParticipantRole, PlayPenalty, PlayType, TeamSide } from "@/lib/domain/play-log";

export type SampleRosterSeed = {
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  grade?: string;
  position?: string;
  offenseRole?: boolean;
  defenseRole?: boolean;
  specialTeamsRole?: boolean;
};

export type SampleParticipantSeed = {
  side: TeamSide;
  jerseyNumber: string;
  role: PlayParticipantRole;
  creditUnits?: number;
};

export type SamplePlaySeed = {
  sequence: string;
  quarter: 1 | 2 | 3 | 4 | 5;
  clock: string;
  possession: TeamSide;
  playType: PlayType;
  summary?: string;
  payload: Record<string, unknown>;
  participants?: SampleParticipantSeed[];
  penalties?: PlayPenalty[];
};

export type SampleGameSeed = {
  organizationName: string;
  teamName: string;
  teamLevel: string;
  seasonLabel: string;
  seasonYear: number;
  opponentSchoolName: string;
  opponentMascot: string;
  opponentShortCode: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  kickoffAt: string;
  homeAway: "home" | "away";
  homeRoster: SampleRosterSeed[];
  awayRoster: SampleRosterSeed[];
  plays: SamplePlaySeed[];
};

export const sampleGameSeed: SampleGameSeed = {
  organizationName: "Tracking the Game Sample Program",
  teamName: "North Creek",
  teamLevel: "Varsity",
  seasonLabel: "2026 Varsity",
  seasonYear: 2026,
  opponentSchoolName: "Central Heights",
  opponentMascot: "Falcons",
  opponentShortCode: "CHS",
  venueName: "North Creek Stadium",
  venueCity: "Cedar Grove",
  venueState: "TX",
  kickoffAt: "2026-09-04T19:00:00.000Z",
  homeAway: "home",
  homeRoster: [
    { jerseyNumber: "18", firstName: "Evan", lastName: "Reed", position: "QB", offenseRole: true },
    { jerseyNumber: "34", firstName: "Marcus", lastName: "Hill", position: "RB", offenseRole: true },
    { jerseyNumber: "5", firstName: "Jalen", lastName: "Brooks", position: "WR", offenseRole: true },
    { jerseyNumber: "11", firstName: "Noah", lastName: "Lane", position: "WR", offenseRole: true },
    { jerseyNumber: "3", firstName: "Milo", lastName: "Cross", position: "K", specialTeamsRole: true },
    { jerseyNumber: "7", firstName: "Ty", lastName: "Mercer", position: "P", specialTeamsRole: true },
    { jerseyNumber: "52", firstName: "Gabe", lastName: "Stone", position: "LB", defenseRole: true },
    { jerseyNumber: "7D", firstName: "Cam", lastName: "Owens", preferredName: "Cam Owens", position: "DB", defenseRole: true },
    { jerseyNumber: "90", firstName: "Jace", lastName: "Walton", position: "DL", defenseRole: true },
    { jerseyNumber: "2", firstName: "Dorian", lastName: "Reeves", position: "CB", defenseRole: true }
  ],
  awayRoster: [
    { jerseyNumber: "12", firstName: "Aiden", lastName: "Price", position: "QB", offenseRole: true },
    { jerseyNumber: "22", firstName: "Roman", lastName: "Lee", position: "RB", offenseRole: true },
    { jerseyNumber: "9", firstName: "Kobe", lastName: "Vance", position: "WR", offenseRole: true },
    { jerseyNumber: "2", firstName: "Mason", lastName: "Cole", position: "RET", specialTeamsRole: true },
    { jerseyNumber: "9K", firstName: "Leo", lastName: "Pruitt", preferredName: "Leo Pruitt", position: "K", specialTeamsRole: true },
    { jerseyNumber: "52", firstName: "Devin", lastName: "Kerr", position: "LB", defenseRole: true },
    { jerseyNumber: "7", firstName: "Tariq", lastName: "Mills", position: "DB", defenseRole: true },
    { jerseyNumber: "44", firstName: "Brady", lastName: "Snow", position: "LB", defenseRole: true },
    { jerseyNumber: "91", firstName: "Cole", lastName: "Rivers", position: "DL", defenseRole: true }
  ],
  plays: [
    {
      sequence: "1",
      quarter: 1,
      clock: "12:00",
      possession: "away",
      playType: "kickoff",
      payload: { kind: "kickoff", kickerNumber: "9K", kickDistance: 57, returnYards: 19, result: "returned" },
      participants: [
        { side: "away", jerseyNumber: "9K", role: "kicker" },
        { side: "home", jerseyNumber: "2", role: "returner" }
      ]
    },
    {
      sequence: "2",
      quarter: 1,
      clock: "11:42",
      possession: "home",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "34", runKind: "designed", yards: 6 },
      participants: [
        { side: "home", jerseyNumber: "34", role: "ball_carrier" },
        { side: "away", jerseyNumber: "52", role: "solo_tackle" }
      ]
    },
    {
      sequence: "3",
      quarter: 1,
      clock: "11:11",
      possession: "home",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "18",
        targetNumber: "11",
        result: "complete",
        yards: 14,
        firstDown: true
      },
      participants: [
        { side: "home", jerseyNumber: "18", role: "passer" },
        { side: "home", jerseyNumber: "11", role: "target" },
        { side: "away", jerseyNumber: "7", role: "assist_tackle" }
      ]
    },
    {
      sequence: "4",
      quarter: 1,
      clock: "10:36",
      possession: "home",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "18",
        targetNumber: "5",
        result: "complete",
        yards: 41,
        touchdown: true
      },
      participants: [
        { side: "home", jerseyNumber: "18", role: "passer" },
        { side: "home", jerseyNumber: "5", role: "target" }
      ]
    },
    {
      sequence: "5",
      quarter: 1,
      clock: "10:36",
      possession: "home",
      playType: "extra_point",
      payload: { kind: "extra_point", kickerNumber: "3", result: "good" },
      participants: [{ side: "home", jerseyNumber: "3", role: "kicker" }]
    },
    {
      sequence: "6",
      quarter: 1,
      clock: "10:36",
      possession: "home",
      playType: "kickoff",
      payload: { kind: "kickoff", kickerNumber: "3", kickDistance: 63, result: "touchback" },
      participants: [{ side: "home", jerseyNumber: "3", role: "kicker" }]
    },
    {
      sequence: "7",
      quarter: 1,
      clock: "10:09",
      possession: "away",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "22", runKind: "designed", yards: 5 },
      participants: [
        { side: "away", jerseyNumber: "22", role: "ball_carrier" },
        { side: "home", jerseyNumber: "52", role: "solo_tackle" }
      ]
    },
    {
      sequence: "8",
      quarter: 1,
      clock: "09:37",
      possession: "away",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "12",
        targetNumber: "9",
        result: "incomplete",
        yards: 0
      },
      participants: [
        { side: "away", jerseyNumber: "12", role: "passer" },
        { side: "away", jerseyNumber: "9", role: "target" },
        { side: "home", jerseyNumber: "7D", role: "pass_breakup" }
      ]
    },
    {
      sequence: "9",
      quarter: 1,
      clock: "09:02",
      possession: "away",
      playType: "turnover",
      payload: {
        kind: "turnover",
        turnoverKind: "interception_return",
        returnerNumber: "2",
        returnYards: 18
      },
      participants: [
        { side: "home", jerseyNumber: "2", role: "interceptor" },
        { side: "home", jerseyNumber: "2", role: "returner" }
      ],
      penalties: [
        {
          penalizedSide: "home",
          code: "unsportsmanlike",
          yards: 15,
          result: "accepted",
          enforcementType: "succeeding_spot",
          timing: "post_possession"
        }
      ]
    },
    {
      sequence: "10",
      quarter: 1,
      clock: "08:22",
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 12,
        firstDown: true
      },
      participants: [
        { side: "home", jerseyNumber: "34", role: "ball_carrier" },
        { side: "away", jerseyNumber: "44", role: "assist_tackle" },
        { side: "away", jerseyNumber: "52", role: "assist_tackle" }
      ]
    },
    {
      sequence: "11",
      quarter: 1,
      clock: "07:48",
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 23,
        touchdown: true
      },
      participants: [{ side: "home", jerseyNumber: "34", role: "ball_carrier" }]
    },
    {
      sequence: "12",
      quarter: 1,
      clock: "07:48",
      possession: "home",
      playType: "two_point_try",
      payload: {
        kind: "two_point_try",
        playStyle: "run",
        ballCarrierNumber: "34",
        result: "good"
      },
      participants: [{ side: "home", jerseyNumber: "34", role: "ball_carrier" }]
    },
    {
      sequence: "13",
      quarter: 1,
      clock: "07:48",
      possession: "home",
      playType: "kickoff",
      payload: {
        kind: "kickoff",
        kickerNumber: "3",
        kickDistance: 54,
        returnYards: 24,
        result: "returned"
      },
      participants: [
        { side: "home", jerseyNumber: "3", role: "kicker" },
        { side: "away", jerseyNumber: "2", role: "returner" }
      ]
    },
    {
      sequence: "14",
      quarter: 1,
      clock: "07:06",
      possession: "away",
      playType: "sack",
      payload: {
        kind: "sack",
        quarterbackNumber: "12",
        yardsLost: 8
      },
      participants: [
        { side: "home", jerseyNumber: "52", role: "sack_credit" },
        { side: "home", jerseyNumber: "52", role: "solo_tackle" }
      ]
    },
    {
      sequence: "15",
      quarter: 1,
      clock: "06:25",
      possession: "away",
      playType: "punt",
      payload: {
        kind: "punt",
        punterNumber: "9K",
        puntDistance: 41,
        returnYards: 9,
        result: "returned"
      },
      participants: [
        { side: "away", jerseyNumber: "9K", role: "punter" },
        { side: "home", jerseyNumber: "2", role: "returner" }
      ]
    },
    {
      sequence: "16",
      quarter: 1,
      clock: "05:49",
      possession: "home",
      playType: "penalty",
      payload: { kind: "penalty", liveBall: false, note: "False start" },
      penalties: [
        {
          penalizedSide: "home",
          code: "false_start",
          yards: 5,
          result: "accepted",
          enforcementType: "previous_spot",
          timing: "dead_ball",
          replayDown: true,
          noPlay: true
        }
      ]
    },
    {
      sequence: "17",
      quarter: 1,
      clock: "05:12",
      possession: "home",
      playType: "field_goal",
      payload: {
        kind: "field_goal",
        kickerNumber: "3",
        kickDistance: 37,
        result: "good"
      },
      participants: [{ side: "home", jerseyNumber: "3", role: "kicker" }]
    },
    {
      sequence: "18",
      quarter: 1,
      clock: "05:12",
      possession: "home",
      playType: "kickoff",
      payload: {
        kind: "kickoff",
        kickerNumber: "3",
        kickDistance: 59,
        result: "touchback"
      },
      participants: [{ side: "home", jerseyNumber: "3", role: "kicker" }]
    }
  ]
};
