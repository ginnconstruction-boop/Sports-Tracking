"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameDayPlayView, GameDaySnapshot } from "@/lib/domain/game-day";
import type { PlayParticipant, PlayPenalty, PlayType, TeamSide } from "@/lib/domain/play-log";
import { formatClock } from "@/lib/engine/clock";
import { midpointSequence } from "@/lib/engine/sequence";
import { isFeatureEnabled } from "@/lib/features/runtime";

type PenaltyDraft = {
  id: string;
  penalizedSide: TeamSide;
  code: string;
  yards: string;
  result: "accepted" | "declined" | "offsetting";
  enforcementType: "previous_spot" | "spot" | "dead_ball" | "succeeding_spot";
  timing: "live_ball" | "dead_ball" | "post_possession" | "post_score";
  foulSpotSide: TeamSide;
  foulSpotYardLine: string;
  automaticFirstDown: boolean;
  lossOfDown: boolean;
  replayDown: boolean;
  noPlay: boolean;
};

export type PlayEntryIntent =
  | { kind: "append" }
  | { kind: "edit"; play: GameDayPlayView }
  | { kind: "insert"; beforePlay: GameDayPlayView };

export type PlaySubmission = {
  mode: "create" | "edit";
  playId?: string;
  body: {
    sequence: string;
    clientMutationId?: string;
    quarter: 1 | 2 | 3 | 4 | 5;
    clock: string;
    possession: TeamSide;
    playType: PlayType;
    summary?: string;
    payload: Record<string, unknown>;
    participants: PlayParticipant[];
    penalties: PlayPenalty[];
  };
};

type Props = {
  snapshot: GameDaySnapshot;
  intent: PlayEntryIntent;
  disabled?: boolean;
  submitting?: boolean;
  compactMode?: boolean;
  storageKey?: string;
  viewerMode?: boolean;
  onSubmit: (submission: PlaySubmission) => Promise<void>;
  onCancelIntent: () => void;
};

type FormState = {
  playType: PlayType;
  quarter: 1 | 2 | 3 | 4 | 5;
  clock: string;
  possession: TeamSide;
  summary: string;
  jerseyA: string;
  jerseyB: string;
  defense: string;
  defenseTwo: string;
  defenseThree: string;
  takeaway: string;
  forced: string;
  recovery: string;
  returner: string;
  yards: string;
  yardsLost: string;
  kickDistance: string;
  returnYards: string;
  runKind: "designed" | "scramble" | "quarterback_keep" | "reverse";
  passResult: "complete" | "incomplete" | "interception";
  kickResult: "good" | "no_good" | "blocked";
  returnResult: "returned" | "touchback" | "fair_catch" | "out_of_bounds" | "downed";
  twoPointStyle: "run" | "pass";
  twoPointResult: "good" | "failed" | "turnover";
  turnoverKind: "fumble_return" | "interception_return" | "blocked_kick_return";
  firstDown: boolean;
  touchdown: boolean;
  fumble: boolean;
  fumbleLost: boolean;
  liveBallPenaltyOnly: boolean;
  penalties: PenaltyDraft[];
};

type FocusField =
  | "jerseyA"
  | "jerseyB"
  | "defense"
  | "defenseTwo"
  | "defenseThree"
  | "takeaway"
  | "forced"
  | "recovery"
  | "returner";

type ParticipantField = {
  key: FocusField;
  label: string;
  team: TeamSide;
  hint?: string;
};

type LikelyPick = {
  key: string;
  label: string;
  apply: (current: FormState) => FormState;
};

type PlayPreset = {
  key: string;
  label: string;
  apply: (current: FormState) => FormState;
};

type PenaltyPreset = {
  key: string;
  label: string;
  apply: (current: FormState) => FormState;
};

const penaltyDefaults = (side: TeamSide): PenaltyDraft => ({
  id: crypto.randomUUID(),
  penalizedSide: side,
  code: "",
  yards: "5",
  result: "accepted",
  enforcementType: "previous_spot",
  timing: "live_ball",
  foulSpotSide: side,
  foulSpotYardLine: "25",
  automaticFirstDown: false,
  lossOfDown: false,
  replayDown: false,
  noPlay: false
});

function createPenaltyDraft(
  possession: TeamSide,
  overrides: Partial<PenaltyDraft> & Pick<PenaltyDraft, "code">
): PenaltyDraft {
  return {
    ...penaltyDefaults(possession),
    ...overrides,
    id: crypto.randomUUID()
  };
}

function createForm(snapshot: GameDaySnapshot): FormState {
  return {
    playType: snapshot.currentState.phase === "try" ? "extra_point" : snapshot.currentState.phase === "kickoff" ? "kickoff" : "run",
    quarter: snapshot.currentState.quarter,
    clock: formatClock(snapshot.currentState.clockSeconds),
    possession: snapshot.currentState.possession,
    summary: "",
    jerseyA: "",
    jerseyB: "",
    defense: "",
    defenseTwo: "",
    defenseThree: "",
    takeaway: "",
    forced: "",
    recovery: "",
    returner: "",
    yards: "0",
    yardsLost: "0",
    kickDistance: snapshot.currentState.phase === "kickoff" ? "60" : "0",
    returnYards: "0",
    runKind: "designed",
    passResult: "complete",
    kickResult: "good",
    returnResult: "returned",
    twoPointStyle: "run",
    twoPointResult: "good",
    turnoverKind: "interception_return",
    firstDown: false,
    touchdown: false,
    fumble: false,
    fumbleLost: false,
    liveBallPenaltyOnly: false,
    penalties: []
  };
}

const playOptionsByPhase = {
  normal: ["run", "pass", "sack", "punt", "field_goal", "turnover", "penalty"],
  try: ["extra_point", "two_point_try", "penalty"],
  kickoff: ["kickoff", "penalty"]
} as const;

const defensiveFieldKeys = new Set<FocusField>(["defense", "defenseTwo", "defenseThree", "takeaway", "forced", "recovery"]);

function playTypeLabel(playType: PlayType) {
  switch (playType) {
    case "field_goal":
      return "Field Goal";
    case "extra_point":
    case "two_point_try":
      return "PAT / 2PT";
    default:
      return playType.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function playTypeDescription(playType: PlayType) {
  switch (playType) {
    case "run":
      return "Number-first rushing entry with quick outcome toggles.";
    case "pass":
      return "Passer, target, and result first. Extra fields appear only when needed.";
    case "sack":
      return "Quarterback, loss, and rush credit without leaving the live screen.";
    case "punt":
      return "Punter, distance, result, and return in one compact block.";
    case "kickoff":
      return "Kick result first, then return detail only if the ball comes back.";
    case "field_goal":
      return "Kick attempt, distance, and made / missed / blocked result.";
    case "extra_point":
    case "two_point_try":
      return "Try-phase entry with only the fields this conversion needs.";
    case "turnover":
      return "Recovering side, returner, and touchdown toggle.";
    case "penalty":
      return "Penalty-only entry with acceptance and enforcement controls.";
    default:
      return "Live entry panel for the current snap.";
  }
}

function setFieldValue<K extends keyof FormState>(current: FormState, key: K, value: FormState[K]) {
  return {
    ...current,
    [key]: value
  };
}

function roleOrder(roles: string[]) {
  return new Set(roles);
}

function findRecentParticipantNumber(
  snapshot: GameDaySnapshot,
  side: TeamSide,
  acceptedRoles: string[]
) {
  const accepted = roleOrder(acceptedRoles);
  const rosterIndex = new Map(
    snapshot.rosters[side].map((entry) => [entry.id, entry.jerseyNumber])
  );

  for (const item of snapshot.recentPlays) {
    for (const participant of item.play.participants) {
      if (participant.side !== side || !accepted.has(participant.role)) {
        continue;
      }

      const jerseyNumber = participant.gameRosterEntryId
        ? rosterIndex.get(participant.gameRosterEntryId)
        : undefined;

      if (jerseyNumber) {
        return jerseyNumber;
      }
    }
  }

  return undefined;
}

function findRecentParticipantNumbers(
  snapshot: GameDaySnapshot,
  side: TeamSide,
  acceptedRoles: string[],
  limit = 3
) {
  const accepted = roleOrder(acceptedRoles);
  const rosterIndex = new Map(
    snapshot.rosters[side].map((entry) => [entry.id, entry.jerseyNumber])
  );
  const seen = new Set<string>();
  const values: string[] = [];

  for (const item of snapshot.recentPlays) {
    for (const participant of item.play.participants) {
      if (participant.side !== side || !accepted.has(participant.role)) {
        continue;
      }

      const jerseyNumber = participant.gameRosterEntryId
        ? rosterIndex.get(participant.gameRosterEntryId)
        : undefined;

      if (!jerseyNumber || seen.has(jerseyNumber)) {
        continue;
      }

      seen.add(jerseyNumber);
      values.push(jerseyNumber);

      if (values.length >= limit) {
        return values;
      }
    }
  }

  return values;
}

function findRecentPayloadNumber(
  snapshot: GameDaySnapshot,
  side: TeamSide,
  field: string
) {
  for (const item of snapshot.recentPlays) {
    if (item.play.possession !== side) {
      continue;
    }

    const payload = item.play.payload as Record<string, unknown>;
    const value = payload[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function autofillDefenseFields(
  snapshot: GameDaySnapshot,
  form: FormState,
  showAdvancedParticipantCapture: boolean
) {
  const offense = form.possession;
  const defense = offense === "home" ? "away" : "home";
  const next = { ...form };

  const tackles = findRecentParticipantNumbers(snapshot, defense, ["solo_tackle", "assist_tackle"], 3);
  const sacks = findRecentParticipantNumbers(snapshot, defense, ["sack_credit"], 2);
  const interceptions = findRecentParticipantNumbers(snapshot, defense, ["interceptor"], 1);
  const passBreakups = findRecentParticipantNumbers(snapshot, defense, ["pass_breakup"], 1);
  const forced = findRecentParticipantNumbers(snapshot, defense, ["forced_fumble"], 1);
  const recoveries = findRecentParticipantNumbers(snapshot, defense, ["fumble_recovery"], 1);
  const blocks = findRecentParticipantNumbers(snapshot, defense, ["block_credit"], 1);
  const returners = findRecentParticipantNumbers(snapshot, defense, ["returner"], 1);

  if (form.playType === "run") {
    next.defense = tackles[0] ?? next.defense;
    if (showAdvancedParticipantCapture) {
      next.defenseTwo = tackles[1] ?? next.defenseTwo;
      next.defenseThree = tackles[2] ?? next.defenseThree;
    }
    if (form.fumble) next.forced = forced[0] ?? next.forced;
    if (form.fumbleLost) next.recovery = recoveries[0] ?? next.recovery;
    return next;
  }

  if (form.playType === "pass") {
    if (form.passResult === "complete") {
      next.defense = tackles[0] ?? next.defense;
      if (showAdvancedParticipantCapture) {
        next.defenseTwo = tackles[1] ?? next.defenseTwo;
        next.defenseThree = tackles[2] ?? next.defenseThree;
      }
    } else if (form.passResult === "incomplete") {
      next.takeaway = passBreakups[0] ?? next.takeaway;
    } else {
      next.takeaway = interceptions[0] ?? next.takeaway;
      next.returner = returners[0] ?? (next.returner || next.takeaway);
    }
    return next;
  }

  if (form.playType === "sack") {
    next.defense = sacks[0] ?? next.defense;
    if (showAdvancedParticipantCapture) {
      next.defenseTwo = sacks[1] ?? next.defenseTwo;
    }
    if (form.fumble) next.forced = forced[0] ?? next.forced;
    if (form.fumbleLost) next.recovery = recoveries[0] ?? next.recovery;
    return next;
  }

  if (form.playType === "punt" || form.playType === "kickoff") {
    next.returner = returners[0] ?? next.returner;
    return next;
  }

  if (form.playType === "field_goal" || form.playType === "extra_point") {
    next.takeaway = blocks[0] ?? next.takeaway;
    return next;
  }

  if (form.playType === "turnover") {
    if (form.turnoverKind === "interception_return") {
      next.takeaway = interceptions[0] ?? next.takeaway;
      next.returner = returners[0] ?? (next.returner || next.takeaway);
    } else if (form.turnoverKind === "fumble_return") {
      next.forced = forced[0] ?? next.forced;
      next.recovery = recoveries[0] ?? next.recovery;
      next.returner = returners[0] ?? (next.returner || next.recovery);
    } else {
      next.takeaway = blocks[0] ?? next.takeaway;
      next.returner = returners[0] ?? next.returner;
    }
  }

  return next;
}

function buildLikelyPicks(snapshot: GameDaySnapshot, form: FormState): LikelyPick[] {
  const offense = form.possession;
  const defense = offense === "home" ? "away" : "home";
  const picks: LikelyPick[] = [];
  const pushPick = (key: string, label: string, apply: LikelyPick["apply"]) => {
    picks.push({ key, label, apply });
  };

  const recentRunner =
    findRecentPayloadNumber(snapshot, offense, "ballCarrierNumber") ??
    findRecentPayloadNumber(snapshot, offense, "returnerNumber");
  const recentPasser = findRecentPayloadNumber(snapshot, offense, "passerNumber");
  const recentTarget = findRecentPayloadNumber(snapshot, offense, "targetNumber");
  const recentQuarterback =
    findRecentPayloadNumber(snapshot, offense, "quarterbackNumber") ?? recentPasser;
  const recentKicker = findRecentPayloadNumber(snapshot, offense, "kickerNumber");
  const recentPunter = findRecentPayloadNumber(snapshot, offense, "punterNumber");
  const recentReturner = findRecentParticipantNumber(snapshot, defense, ["returner"]);
  const recentTackler = findRecentParticipantNumber(snapshot, defense, ["solo_tackle", "assist_tackle"]);
  const recentCoverage = findRecentParticipantNumber(snapshot, defense, ["pass_breakup", "interceptor"]);
  const recentSack = findRecentParticipantNumber(snapshot, defense, ["sack_credit"]);
  const recentForced = findRecentParticipantNumber(snapshot, defense, ["forced_fumble"]);
  const recentRecovery = findRecentParticipantNumber(snapshot, defense, ["fumble_recovery"]);
  const recentBlock = findRecentParticipantNumber(snapshot, defense, ["block_credit"]);

  if (form.playType === "run" && recentRunner) {
    pushPick(`runner-${recentRunner}`, `Runner #${recentRunner}`, (current) => setFieldValue(current, "jerseyA", recentRunner));
  }
  if (form.playType === "pass" && recentPasser) {
    pushPick(`passer-${recentPasser}`, `QB #${recentPasser}`, (current) => setFieldValue(current, "jerseyA", recentPasser));
  }
  if (form.playType === "pass" && recentTarget) {
    pushPick(`target-${recentTarget}`, `Target #${recentTarget}`, (current) => setFieldValue(current, "jerseyB", recentTarget));
  }
  if (form.playType === "sack" && recentQuarterback) {
    pushPick(`qb-${recentQuarterback}`, `QB #${recentQuarterback}`, (current) => setFieldValue(current, "jerseyA", recentQuarterback));
  }
  if (["kickoff", "extra_point", "field_goal"].includes(form.playType) && recentKicker) {
    pushPick(`kicker-${recentKicker}`, `Kicker #${recentKicker}`, (current) => setFieldValue(current, "jerseyA", recentKicker));
  }
  if (form.playType === "punt" && recentPunter) {
    pushPick(`punter-${recentPunter}`, `Punter #${recentPunter}`, (current) => setFieldValue(current, "jerseyA", recentPunter));
  }
  if (["kickoff", "punt", "turnover"].includes(form.playType) && recentReturner) {
    pushPick(`returner-${recentReturner}`, `Returner #${recentReturner}`, (current) => setFieldValue(current, "returner", recentReturner));
  }
  if (["run", "pass", "turnover"].includes(form.playType) && recentTackler) {
    pushPick(`tackle-${recentTackler}`, `Defender #${recentTackler}`, (current) => setFieldValue(current, "defense", recentTackler));
  }
  if (form.playType === "pass" && recentCoverage) {
    pushPick(`coverage-${recentCoverage}`, `Coverage #${recentCoverage}`, (current) => setFieldValue(current, "takeaway", recentCoverage));
  }
  if (form.playType === "sack" && recentSack) {
    pushPick(`sack-${recentSack}`, `Rush #${recentSack}`, (current) => setFieldValue(current, "defense", recentSack));
  }
  if ((form.fumble || form.turnoverKind === "fumble_return") && recentForced) {
    pushPick(`forced-${recentForced}`, `Forced #${recentForced}`, (current) => setFieldValue(current, "forced", recentForced));
  }
  if ((form.fumbleLost || form.turnoverKind === "fumble_return") && recentRecovery) {
    pushPick(`recovery-${recentRecovery}`, `Recovery #${recentRecovery}`, (current) => setFieldValue(current, "recovery", recentRecovery));
  }
  if (
    (form.playType === "extra_point" || form.playType === "field_goal" || form.turnoverKind === "blocked_kick_return") &&
    recentBlock
  ) {
    pushPick(`block-${recentBlock}`, `Block #${recentBlock}`, (current) => setFieldValue(current, "takeaway", recentBlock));
  }
  if ((form.playType === "pass" && form.passResult === "interception") || form.turnoverKind === "interception_return") {
    if (form.takeaway && !form.returner) {
      pushPick(`same-returner-${form.takeaway}`, `Returner same as takeaway`, (current) =>
        setFieldValue(current, "returner", current.takeaway)
      );
    }
  }
  if (form.turnoverKind === "fumble_return" && form.recovery && !form.returner) {
    pushPick(`same-recovery-${form.recovery}`, `Returner same as recovery`, (current) =>
      setFieldValue(current, "returner", current.recovery)
    );
  }

  if (form.playType === "two_point_try" && recentRunner) {
    pushPick(`try-runner-${recentRunner}`, `Try #${recentRunner}`, (current) =>
      setFieldValue(current, form.twoPointStyle === "run" ? "jerseyA" : "jerseyB", recentRunner)
    );
  }

  return picks.slice(0, 6);
}

function buildPlayPresets(snapshot: GameDaySnapshot, form: FormState): PlayPreset[] {
  const presets: PlayPreset[] = [];
  const offense = form.possession;
  const phase = snapshot.currentState.phase;

  const push = (key: string, label: string, apply: PlayPreset["apply"]) => {
    presets.push({ key, label, apply });
  };

  if (phase === "normal") {
    push("run-4", "Run +4", (current) => ({
      ...current,
      playType: "run",
      yards: "4",
      runKind: "designed",
      passResult: "complete",
      touchdown: false,
      firstDown: false
    }));
    push("pass-short", "Pass +8", (current) => ({
      ...current,
      playType: "pass",
      passResult: "complete",
      yards: "8",
      touchdown: false,
      firstDown: false
    }));
    push("incomplete", "Incomplete", (current) => ({
      ...current,
      playType: "pass",
      passResult: "incomplete",
      yards: "0",
      touchdown: false,
      firstDown: false
    }));
    push("sack", "Sack", (current) => ({
      ...current,
      playType: "sack",
      yardsLost: "7",
      fumble: false,
      fumbleLost: false
    }));
    push("punt", "Punt", (current) => ({
      ...current,
      playType: "punt",
      kickDistance: "40",
      returnResult: "returned",
      returnYards: "8"
    }));
    push("turnover", "INT return", (current) => ({
      ...current,
      playType: "turnover",
      turnoverKind: "interception_return",
      returnYards: "12",
      touchdown: false
    }));
    push("penalty", "Penalty only", (current) => ({
      ...current,
      playType: "penalty",
      summary: current.summary || `${offense === "home" ? "Home" : "Away"} penalty`
    }));
  }

  if (phase === "try") {
    push("xp-good", "XP good", (current) => ({
      ...current,
      playType: "extra_point",
      kickResult: "good"
    }));
    push("xp-blocked", "XP blocked", (current) => ({
      ...current,
      playType: "extra_point",
      kickResult: "blocked"
    }));
    push("2pt-run", "2PT run", (current) => ({
      ...current,
      playType: "two_point_try",
      twoPointStyle: "run",
      twoPointResult: "good"
    }));
    push("2pt-pass", "2PT pass", (current) => ({
      ...current,
      playType: "two_point_try",
      twoPointStyle: "pass",
      twoPointResult: "good"
    }));
  }

  if (phase === "kickoff") {
    push("touchback", "Touchback", (current) => ({
      ...current,
      playType: "kickoff",
      returnResult: "touchback",
      kickDistance: "60",
      returnYards: "0"
    }));
    push("kick-return", "Kick return", (current) => ({
      ...current,
      playType: "kickoff",
      returnResult: "returned",
      kickDistance: "58",
      returnYards: "18"
    }));
    push("onside", "Onside/short", (current) => ({
      ...current,
      playType: "kickoff",
      returnResult: "returned",
      kickDistance: "12",
      returnYards: "0"
    }));
  }

  return presets;
}

function buildPenaltyPresets(form: FormState): PenaltyPreset[] {
  const offense = form.possession;
  const defense = offense === "home" ? "away" : "home";

  return [
    {
      key: "false-start",
      label: "False start",
      apply: (current) => ({
        ...current,
        penalties: [
          ...current.penalties,
          createPenaltyDraft(offense, {
            code: "false_start",
            yards: "5",
            result: "accepted",
            enforcementType: "previous_spot",
            timing: "dead_ball",
            replayDown: true,
            noPlay: true
          })
        ]
      })
    },
    {
      key: "offside",
      label: "Offside",
      apply: (current) => ({
        ...current,
        penalties: [
          ...current.penalties,
          createPenaltyDraft(defense, {
            code: "offside",
            yards: "5",
            result: "accepted",
            enforcementType: "previous_spot",
            timing: "dead_ball",
            replayDown: true
          })
        ]
      })
    },
    {
      key: "holding-offense",
      label: "Off. holding",
      apply: (current) => ({
        ...current,
        penalties: [
          ...current.penalties,
          createPenaltyDraft(offense, {
            code: "holding",
            yards: "10",
            result: "accepted",
            enforcementType: "previous_spot",
            timing: "live_ball",
            replayDown: true
          })
        ]
      })
    },
    {
      key: "dpi",
      label: "Pass interference",
      apply: (current) => ({
        ...current,
        penalties: [
          ...current.penalties,
          createPenaltyDraft(defense, {
            code: "pass_interference",
            yards: "15",
            result: "accepted",
            enforcementType: "spot",
            timing: "live_ball",
            automaticFirstDown: true,
            foulSpotSide: offense,
            foulSpotYardLine: current.yards && Number(current.yards) > 0 ? current.yards : "35"
          })
        ]
      })
    },
    {
      key: "roughing",
      label: "Roughing passer",
      apply: (current) => ({
        ...current,
        penalties: [
          ...current.penalties,
          createPenaltyDraft(defense, {
            code: "roughing_passer",
            yards: "15",
            result: "accepted",
            enforcementType: "previous_spot",
            timing: "dead_ball",
            automaticFirstDown: true
          })
        ]
      })
    },
    {
      key: "unsportsmanlike",
      label: "Unsportsmanlike",
      apply: (current) => ({
        ...current,
        penalties: [
          ...current.penalties,
          createPenaltyDraft(defense, {
            code: "unsportsmanlike",
            yards: "15",
            result: "accepted",
            enforcementType: "succeeding_spot",
            timing: current.touchdown || current.playType === "extra_point" ? "post_score" : "post_possession"
          })
        ]
      })
    }
  ];
}

function buildNextPlaySuggestions(snapshot: GameDaySnapshot, form: FormState): PlayPreset[] {
  const state = snapshot.currentState;
  const lastPlay = snapshot.recentPlays[0];
  const suggestions: PlayPreset[] = [];
  const push = (key: string, label: string, apply: PlayPreset["apply"]) => {
    suggestions.push({ key, label, apply });
  };

  if (state.phase === "kickoff") {
    push("suggest-touchback", "Likely touchback", (current) => ({
      ...current,
      playType: "kickoff",
      kickDistance: "60",
      returnResult: "touchback",
      returnYards: "0"
    }));
    return suggestions;
  }

  if (state.phase === "try") {
    push("suggest-standard-xp", "Standard XP", (current) => ({
      ...current,
      playType: "extra_point",
      kickResult: "good"
    }));
    push("suggest-go-for-2", "Go for 2", (current) => ({
      ...current,
      playType: "two_point_try",
      twoPointStyle: "run",
      twoPointResult: "good"
    }));
    return suggestions;
  }

  if (state.down === 4) {
    if (state.ballOn.side === "away" && state.ballOn.yardLine <= 35) {
      push("suggest-field-goal", "Attempt FG", (current) => ({
        ...current,
        playType: "field_goal",
        kickDistance: String(state.ballOn.yardLine + 17),
        kickResult: "good"
      }));
    } else {
      push("suggest-punt-away", "Punt away", (current) => ({
        ...current,
        playType: "punt",
        kickDistance: "40",
        returnResult: "fair_catch",
        returnYards: "0"
      }));
    }
  }

  if (state.distance <= 3) {
    push("suggest-short-yardage", "Short-yardage run", (current) => ({
      ...current,
      playType: "run",
      yards: String(Math.max(state.distance, 2)),
      runKind: "designed"
    }));
  } else {
    push("suggest-keep-schedule", "Stay on schedule", (current) => ({
      ...current,
      playType: "run",
      yards: "4",
      runKind: "designed"
    }));
    push("suggest-quick-game", "Quick game", (current) => ({
      ...current,
      playType: "pass",
      passResult: "complete",
      yards: String(Math.min(Math.max(state.distance, 5), 10))
    }));
  }

  if (state.ballOn.side === "away" && state.ballOn.yardLine <= 12) {
    push("suggest-red-zone-shot", "Red-zone shot", (current) => ({
      ...current,
      playType: "pass",
      passResult: "complete",
      yards: String(Math.max(6, state.ballOn.yardLine)),
      touchdown: true
    }));
  }

  if (state.ballOn.side === "home" && state.ballOn.yardLine <= 10) {
    push("suggest-safe-call", "Safe backed-up run", (current) => ({
      ...current,
      playType: "run",
      yards: "3",
      runKind: "designed",
      touchdown: false,
      firstDown: false
    }));
  }

  if (lastPlay?.play.playType === "sack" || lastPlay?.play.playType === "turnover") {
    push("suggest-settle", "Settle with run", (current) => ({
      ...current,
      playType: "run",
      yards: "4",
      runKind: "designed"
    }));
  }

  if (lastPlay?.play.playType === "penalty") {
    push("suggest-clean-restart", "Clean restart", (current) => ({
      ...current,
      playType: state.distance <= 3 ? "run" : "pass",
      yards: state.distance <= 3 ? String(Math.max(state.distance, 2)) : String(Math.min(Math.max(state.distance, 5), 8)),
      passResult: "complete"
    }));
  }

  if (snapshot.lastPenaltyPlay && snapshot.lastPenaltyPlay.play.playType === "penalty") {
    push("suggest-replay-down", "Replay down", (current) => ({
      ...current,
      playType: form.playType
    }));
  }

  return suggestions.slice(0, 6);
}

function buildPressureLabels(snapshot: GameDaySnapshot) {
  const state = snapshot.currentState;
  return [
    state.down >= 3 ? `${state.down === 3 ? "Third" : "Fourth"} down` : null,
    state.distance <= 3 ? "Short yardage" : null,
    state.ballOn.side === "away" && state.ballOn.yardLine <= 20 ? "Red zone" : null,
    state.ballOn.side === "home" && state.ballOn.yardLine <= 10 ? "Backed up" : null,
    snapshot.currentState.phase === "kickoff" ? "Kick sequence" : null,
    snapshot.currentState.phase === "try" ? "Try phase" : null
  ].filter(Boolean) as string[];
}

function buildParticipantFields(form: FormState, showAdvancedParticipantCapture: boolean): ParticipantField[] {
  const offense = form.possession;
  const defense = offense === "home" ? "away" : "home";
  const field = (key: FocusField, label: string, team: TeamSide, hint?: string): ParticipantField => ({
    key,
    label,
    team,
    hint
  });

  if (form.playType === "penalty") {
    return [];
  }

  if (form.playType === "run") {
    if (!showAdvancedParticipantCapture) {
      return [
        field("jerseyA", "Runner", offense, "Ball carrier"),
        field("defense", "Solo / lead tackle", defense, "Primary tackle"),
        ...(form.fumbleLost ? [field("recovery", "Recovery", defense, "Who got it?")] : [])
      ];
    }

    return [
      field("jerseyA", "Runner", offense, "Ball carrier"),
      field("defense", "Solo / lead tackle", defense, "Use if only one"),
      field("defenseTwo", "Assist 1", defense, "Assist"),
      field("defenseThree", "Assist 2", defense, "Assist"),
      ...(form.fumble ? [field("forced", "Forced fumble", defense, "Who punched it out?")] : []),
      ...(form.fumbleLost ? [field("recovery", "Recovery", defense, "Who got it?")] : [])
    ];
  }

  if (form.playType === "pass") {
    if (!showAdvancedParticipantCapture) {
      return [
        field("jerseyA", "Quarterback", offense, "QB"),
        field("jerseyB", "Intended for", offense, "Receiver"),
        ...(form.passResult === "complete"
          ? [field("defense", "Solo / lead tackle", defense, "Primary tackle")]
          : form.passResult === "interception"
            ? [field("takeaway", "Interceptor", defense, "Takeaway")]
            : [])
      ];
    }

    return [
      field("jerseyA", "Quarterback", offense, "QB"),
      field("jerseyB", "Intended for", offense, "Receiver"),
      ...(form.passResult === "complete"
        ? [
            field("defense", "Solo / lead tackle", defense, "Use if only one"),
            field("defenseTwo", "Assist 1", defense, "Assist"),
            field("defenseThree", "Assist 2", defense, "Assist")
          ]
        : form.passResult === "incomplete"
          ? [field("takeaway", "Pass breakup", defense, "PBU")]
          : [
              field("takeaway", "Interceptor", defense, "Pick"),
              field("returner", "Returner", defense, "Leave blank if same player")
            ])
    ];
  }

  if (form.playType === "sack") {
    if (!showAdvancedParticipantCapture) {
      return [
        field("jerseyA", "Quarterback", offense, "Sacked QB"),
        field("defense", "Sack credit", defense, "Primary pressure"),
        ...(form.fumbleLost ? [field("recovery", "Recovery", defense, "Who got it?")] : [])
      ];
    }

    return [
      field("jerseyA", "Quarterback", offense, "Sacked QB"),
      field("defense", "Sack credit 1", defense, "Primary pressure"),
      field("defenseTwo", "Sack credit 2", defense, "Shared sack"),
      ...(form.fumble ? [field("forced", "Forced fumble", defense, "Strip sack")] : []),
      ...(form.fumbleLost ? [field("recovery", "Recovery", defense, "Who got it?")] : [])
    ];
  }

  if (form.playType === "punt") {
    return [
      field("jerseyA", "Punter", offense, "P"),
      field("returner", "Returner", defense, "PR")
    ];
  }

  if (form.playType === "kickoff") {
    return [
      field("jerseyA", "Kicker", offense, "KO"),
      field("returner", "Returner", defense, "KR")
    ];
  }

  if (form.playType === "extra_point" || form.playType === "field_goal") {
    return [
      field("jerseyA", "Kicker", offense, "K"),
      ...(form.kickResult === "blocked" ? [field("takeaway", "Block credit", defense, "Blocked by")] : [])
    ];
  }

  if (form.playType === "two_point_try") {
    return form.twoPointStyle === "run"
      ? [field("jerseyA", "Ball carrier", offense, "Runner")]
      : [
          field("jerseyA", "Passer", offense, "QB"),
          field("jerseyB", "Target", offense, "Receiver")
        ];
  }

  if (form.playType === "turnover") {
    return form.turnoverKind === "interception_return"
      ? [
          field("takeaway", "Interceptor", defense, "Takeaway"),
          field("returner", "Returner", defense, "Leave blank if same player")
        ]
      : form.turnoverKind === "fumble_return"
        ? [
            field("forced", "Forced fumble", defense, "Who caused it?"),
            field("recovery", "Recovery", defense, "Who secured it?"),
            field("returner", "Returner", defense, "After recovery")
          ]
        : [
            field("takeaway", "Block credit", defense, "Who blocked it?"),
            field("returner", "Returner", defense, "Return player")
          ];
  }

  return [];
}

function validateSubmission(form: FormState) {
  if (!/^\d{1,2}:\d{2}$/.test(form.clock)) {
    return "Clock must be in M:SS format.";
  }

  if (form.playType === "run" && !form.jerseyA) {
    return "Select the ball carrier for the run.";
  }

  if (form.playType === "pass" && !form.jerseyA) {
    return "Select the passer before logging the pass.";
  }

  if (form.playType === "pass" && form.passResult === "complete" && !form.jerseyB) {
    return "Completed passes need a target.";
  }

  if (form.playType === "sack" && !form.jerseyA) {
    return "Enter the quarterback jersey for the sack.";
  }

  if ((form.playType === "punt" || form.playType === "field_goal" || form.playType === "extra_point") && !form.jerseyA) {
    return "Select the kicker or punter for the play.";
  }

  if (form.playType === "turnover" && !form.returner && !form.takeaway && !form.recovery) {
    return "Turnovers need a defender or returner attached.";
  }

  if (form.penalties.some((item) => item.enforcementType === "spot" && !item.foulSpotYardLine)) {
    return "Spot fouls need a foul spot yard line.";
  }

  return null;
}

function formatDownLabel(down: number) {
  if (down === 1) return "1st";
  if (down === 2) return "2nd";
  if (down === 3) return "3rd";
  return `${down}th`;
}

function possessionLabel(side: TeamSide) {
  return side === "home" ? "H (Home)" : "V (Visitor)";
}

export function PlayEntryPanel({
  snapshot,
  intent,
  disabled,
  submitting,
  compactMode,
  storageKey = "game-day-play-entry-collapsed",
  viewerMode = false,
  onSubmit,
  onCancelIntent
}: Props) {
  const showAdvancedParticipantCapture = isFeatureEnabled("advanced_participant_capture");
  const [form, setForm] = useState<FormState>(() => createForm(snapshot));
  const [focusedField, setFocusedField] = useState<FocusField>("jerseyA");
  const [formError, setFormError] = useState<string | null>(null);
  const [entryCollapsed, setEntryCollapsed] = useState(false);
  const participantFields = useMemo(
    () => buildParticipantFields(form, showAdvancedParticipantCapture),
    [form, showAdvancedParticipantCapture]
  );
  const primaryParticipantFields = useMemo(
    () => participantFields.filter((field) => !defensiveFieldKeys.has(field.key)),
    [participantFields]
  );
  const defensiveParticipantFields = useMemo(
    () => participantFields.filter((field) => defensiveFieldKeys.has(field.key)),
    [participantFields]
  );
  const quickOffense = useMemo(() => snapshot.rosters[form.possession].slice(0, 14), [snapshot.rosters, form.possession]);
  const quickDefense = useMemo(
    () => snapshot.rosters[form.possession === "home" ? "away" : "home"].slice(0, 14),
    [snapshot.rosters, form.possession]
  );
  const penaltyPresets = useMemo(() => buildPenaltyPresets(form), [form]);
  const currentPlayLabel = playTypeLabel(form.playType);

  useEffect(() => {
    try {
      const savedValue = window.sessionStorage.getItem(storageKey);
      if (savedValue === "1") {
        setEntryCollapsed(true);
      }
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, entryCollapsed ? "1" : "0");
    } catch {}
  }, [entryCollapsed, storageKey]);

  useEffect(() => {
    if (participantFields.length === 0) {
      return;
    }

    if (!participantFields.some((field) => field.key === focusedField)) {
      setFocusedField(participantFields[0].key);
    }
  }, [focusedField, participantFields]);

  useEffect(() => {
    const next = createForm(snapshot);
    if (intent.kind !== "append") {
      const source = intent.kind === "edit" ? intent.play.play : intent.beforePlay.play;
      next.playType = source.playType;
      next.quarter = source.quarter;
      next.clock = formatClock(source.clockSeconds);
      next.possession = source.possession;
      next.summary = source.summary ?? "";
      next.penalties = source.penalties.map((item) => ({
        ...penaltyDefaults(source.possession),
        id: crypto.randomUUID(),
        penalizedSide: item.penalizedSide,
        code: item.code,
        yards: String(item.yards),
        result: item.result,
        enforcementType: item.enforcementType,
        timing: item.timing,
        foulSpotSide: item.foulSpot?.side ?? source.possession,
        foulSpotYardLine: String(item.foulSpot?.yardLine ?? 25),
        automaticFirstDown: item.automaticFirstDown ?? false,
        lossOfDown: item.lossOfDown ?? false,
        replayDown: item.replayDown ?? false,
        noPlay: item.noPlay ?? false
      }));
      if ("ballCarrierNumber" in source.payload && typeof source.payload.ballCarrierNumber === "string") next.jerseyA = source.payload.ballCarrierNumber;
      if ("passerNumber" in source.payload && typeof source.payload.passerNumber === "string") next.jerseyA = source.payload.passerNumber;
      if ("targetNumber" in source.payload && typeof source.payload.targetNumber === "string") next.jerseyB = source.payload.targetNumber;
      if ("quarterbackNumber" in source.payload && typeof source.payload.quarterbackNumber === "string") next.jerseyA = source.payload.quarterbackNumber;
      if ("kickerNumber" in source.payload && typeof source.payload.kickerNumber === "string") next.jerseyA = source.payload.kickerNumber;
      if ("punterNumber" in source.payload && typeof source.payload.punterNumber === "string") next.jerseyA = source.payload.punterNumber;
      if ("returnerNumber" in source.payload && typeof source.payload.returnerNumber === "string") next.jerseyB = source.payload.returnerNumber;
      if ("yards" in source.payload && typeof source.payload.yards === "number") next.yards = String(source.payload.yards);
      if ("yardsLost" in source.payload && typeof source.payload.yardsLost === "number") next.yardsLost = String(source.payload.yardsLost);
      if ("kickDistance" in source.payload && typeof source.payload.kickDistance === "number") next.kickDistance = String(source.payload.kickDistance);
      if ("puntDistance" in source.payload && typeof source.payload.puntDistance === "number") next.kickDistance = String(source.payload.puntDistance);
      if ("returnYards" in source.payload && typeof source.payload.returnYards === "number") next.returnYards = String(source.payload.returnYards);
      if ("runKind" in source.payload && typeof source.payload.runKind === "string") next.runKind = source.payload.runKind as FormState["runKind"];
      if ("result" in source.payload && typeof source.payload.result === "string") {
        if (source.playType === "pass") next.passResult = source.payload.result as FormState["passResult"];
        if (source.playType === "kickoff" || source.playType === "punt") next.returnResult = source.payload.result as FormState["returnResult"];
        if (source.playType === "extra_point" || source.playType === "field_goal") next.kickResult = source.payload.result as FormState["kickResult"];
        if (source.playType === "two_point_try") next.twoPointResult = source.payload.result as FormState["twoPointResult"];
      }
      if ("turnoverKind" in source.payload && typeof source.payload.turnoverKind === "string") next.turnoverKind = source.payload.turnoverKind as FormState["turnoverKind"];
      if ("playStyle" in source.payload && typeof source.payload.playStyle === "string") next.twoPointStyle = source.payload.playStyle as FormState["twoPointStyle"];
      if ("firstDown" in source.payload) next.firstDown = Boolean(source.payload.firstDown);
      if ("touchdown" in source.payload) next.touchdown = Boolean(source.payload.touchdown);
      if ("fumble" in source.payload) next.fumble = Boolean(source.payload.fumble);
      if ("fumbleLost" in source.payload) next.fumbleLost = Boolean(source.payload.fumbleLost);
      if (source.playType === "penalty" && "liveBall" in source.payload) next.liveBallPenaltyOnly = Boolean(source.payload.liveBall);

      const rosterIndex = new Map(
        [...snapshot.rosters.home, ...snapshot.rosters.away].map((entry) => [entry.id, entry.jerseyNumber])
      );
      const getRoleNumbers = (roles: PlayParticipant["role"][]) =>
        source.participants
          .filter((participant) => roles.includes(participant.role))
          .map((participant) => participant.gameRosterEntryId ? rosterIndex.get(participant.gameRosterEntryId) ?? "" : "")
          .filter(Boolean);

      const tackles = getRoleNumbers(["solo_tackle", "assist_tackle"]);
      const sacks = getRoleNumbers(["sack_credit"]);
      const takeaways = getRoleNumbers(["interceptor", "pass_breakup", "block_credit"]);
      const forced = getRoleNumbers(["forced_fumble"]);
      const recoveries = getRoleNumbers(["fumble_recovery"]);
      const returners = getRoleNumbers(["returner"]);

      next.defense = source.playType === "sack" ? sacks[0] ?? "" : tackles[0] ?? "";
      next.defenseTwo = source.playType === "sack" ? sacks[1] ?? "" : tackles[1] ?? "";
      next.defenseThree = tackles[2] ?? "";
      next.takeaway = takeaways[0] ?? "";
      next.forced = forced[0] ?? "";
      next.recovery = recoveries[0] ?? "";
      next.returner = returners[0] ?? "";
    }
    setForm(next);
    setFormError(null);
  }, [intent, snapshot]);

  useEffect(() => {
    if (intent.kind !== "append") {
      setEntryCollapsed(false);
    }
  }, [intent.kind]);

  const sequence = intent.kind === "edit" ? intent.play.sequence : intent.kind === "insert" ? midpointSequence(intent.beforePlay.previousSequence, intent.beforePlay.sequence) : midpointSequence(snapshot.recentPlays[0]?.sequence, undefined);
  const showRunFields = form.playType === "run";
  const showPassFields = form.playType === "pass";
  const showSackFields = form.playType === "sack";
  const showPuntFields = form.playType === "punt";
  const showKickoffFields = form.playType === "kickoff";
  const showKickTryFields = form.playType === "extra_point" || form.playType === "field_goal";
  const showTwoPointFields = form.playType === "two_point_try";
  const showTurnoverFields = form.playType === "turnover";
  const showPenaltyOnlyFields = form.playType === "penalty";
  const activeFieldLabel = participantFields.find((field) => field.key === focusedField)?.label ?? "Participant";
  const primarySectionTitle =
    showRunFields ? "6. Runner" :
    showPassFields ? "6. Quarterback and intended target" :
    showSackFields ? "6. Quarterback and rush credit" :
    showPuntFields ? "6. Punter and returner" :
    showKickoffFields ? "6. Kicker and returner" :
    showKickTryFields ? "6. Kicker" :
    showTwoPointFields ? "6. Conversion players" :
    showTurnoverFields ? "6. Takeaway players" :
    "6. Player input";
  const primarySectionCopy =
    showRunFields ? "Enter the runner first, then yards gained or lost." :
    showPassFields ? "Quarterback first, then intended target, then result." :
    showSackFields ? "Quarterback first, then sack or strip credit." :
    showPuntFields || showKickoffFields ? "Special teams entry stays number-first." :
    showKickTryFields ? "Enter the kicker, then the kick result." :
    showTwoPointFields ? "Log the conversion players before the result." :
    showTurnoverFields ? "Capture the takeaway player and returner if needed." :
    "Tap a role, then use quick chips or type the jersey number.";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormError(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resolveId(side: TeamSide, jerseyNumber: string) {
    return snapshot.rosters[side].find((entry) => entry.jerseyNumber === jerseyNumber)?.id;
  }

  function addQuick(jerseyNumber: string) {
    setFormError(null);
    setForm((current) => ({ ...current, [focusedField]: jerseyNumber }));
  }

  function autoFillDefense() {
    setFormError(null);
    setForm((current) => autofillDefenseFields(snapshot, current, showAdvancedParticipantCapture));
  }

  async function submit() {
    const validationError = validateSubmission(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const offense = form.possession;
    const defenseSide = offense === "home" ? "away" : "home";
    const participants: PlayParticipant[] = [];
    const maybePush = (jersey: string, role: PlayParticipant["role"], side: TeamSide) => {
      if (!jersey) return;
      participants.push({ gameRosterEntryId: resolveId(side, jersey), role, side, creditUnits: 1 });
    };
    const addTackles = () => {
      [form.defense, form.defenseTwo, form.defenseThree].filter(Boolean).forEach((jersey, index, list) => {
        maybePush(jersey, list.length === 1 ? "solo_tackle" : "assist_tackle", defenseSide);
      });
    };

    let payload: Record<string, unknown> = { kind: form.playType };
    if (form.playType === "run") {
      maybePush(form.jerseyA, "ball_carrier", offense);
      addTackles();
      maybePush(form.forced, "forced_fumble", defenseSide);
      if (form.fumbleLost) {
        maybePush(form.recovery, "fumble_recovery", defenseSide);
      }
      payload = { kind: "run", ballCarrierNumber: form.jerseyA, runKind: form.runKind, yards: Number(form.yards), firstDown: form.firstDown || undefined, touchdown: form.touchdown || undefined, fumble: form.fumble || undefined, fumbleLost: form.fumbleLost || undefined };
    } else if (form.playType === "pass") {
      maybePush(form.jerseyA, "passer", offense); maybePush(form.jerseyB, "target", offense);
      if (form.passResult === "interception") {
        maybePush(form.takeaway, "interceptor", defenseSide);
        maybePush(form.returner || form.takeaway, "returner", defenseSide);
      } else if (form.passResult === "incomplete" && form.takeaway) {
        maybePush(form.takeaway, "pass_breakup", defenseSide);
      } else addTackles();
      payload = { kind: "pass", passerNumber: form.jerseyA, targetNumber: form.jerseyB || undefined, result: form.passResult, yards: Number(form.yards), firstDown: form.firstDown || undefined, touchdown: form.touchdown || undefined };
    } else if (form.playType === "sack") {
      [form.defense, form.defenseTwo].filter(Boolean).forEach((jersey) => maybePush(jersey, "sack_credit", defenseSide));
      maybePush(form.forced, "forced_fumble", defenseSide);
      if (form.fumbleLost) {
        maybePush(form.recovery, "fumble_recovery", defenseSide);
      }
      payload = { kind: "sack", quarterbackNumber: form.jerseyA, yardsLost: Number(form.yardsLost), fumble: form.fumble || undefined, fumbleLost: form.fumbleLost || undefined };
    } else if (form.playType === "punt") {
      maybePush(form.jerseyA, "punter", offense); maybePush(form.returner, "returner", defenseSide);
      payload = { kind: "punt", punterNumber: form.jerseyA, puntDistance: Number(form.kickDistance), returnYards: Number(form.returnYards), result: form.returnResult };
    } else if (form.playType === "kickoff") {
      maybePush(form.jerseyA, "kicker", offense); maybePush(form.returner, "returner", defenseSide);
      payload = { kind: "kickoff", kickerNumber: form.jerseyA || undefined, kickDistance: Number(form.kickDistance), returnYards: form.returnResult === "touchback" ? undefined : Number(form.returnYards), result: form.returnResult };
    } else if (form.playType === "extra_point") {
      maybePush(form.jerseyA, "kicker", offense);
      if (form.kickResult === "blocked") {
        maybePush(form.takeaway, "block_credit", defenseSide);
      }
      payload = { kind: "extra_point", kickerNumber: form.jerseyA || undefined, result: form.kickResult };
    } else if (form.playType === "field_goal") {
      maybePush(form.jerseyA, "kicker", offense);
      if (form.kickResult === "blocked") {
        maybePush(form.takeaway, "block_credit", defenseSide);
      }
      payload = { kind: "field_goal", kickerNumber: form.jerseyA || undefined, kickDistance: Number(form.kickDistance), result: form.kickResult };
    } else if (form.playType === "two_point_try") {
      if (form.twoPointStyle === "run") maybePush(form.jerseyA, "ball_carrier", offense); else { maybePush(form.jerseyA, "passer", offense); maybePush(form.jerseyB, "target", offense); }
      payload = { kind: "two_point_try", playStyle: form.twoPointStyle, passerNumber: form.twoPointStyle === "pass" ? form.jerseyA || undefined : undefined, targetNumber: form.twoPointStyle === "pass" ? form.jerseyB || undefined : undefined, ballCarrierNumber: form.twoPointStyle === "run" ? form.jerseyA || undefined : undefined, result: form.twoPointResult };
    } else if (form.playType === "turnover") {
      if (form.turnoverKind === "interception_return") {
        maybePush(form.takeaway, "interceptor", defenseSide);
        maybePush(form.returner || form.takeaway, "returner", defenseSide);
      } else if (form.turnoverKind === "fumble_return") {
        maybePush(form.forced, "forced_fumble", defenseSide);
        maybePush(form.recovery, "fumble_recovery", defenseSide);
        maybePush(form.returner || form.recovery, "returner", defenseSide);
      } else {
        maybePush(form.takeaway, "block_credit", defenseSide);
        maybePush(form.returner, "returner", defenseSide);
      }
      payload = { kind: "turnover", turnoverKind: form.turnoverKind, returnerNumber: form.returner || undefined, returnYards: Number(form.returnYards), touchdown: form.touchdown || undefined };
    } else if (form.playType === "penalty") {
      payload = { kind: "penalty", liveBall: form.liveBallPenaltyOnly, note: form.summary || undefined };
    }

    await onSubmit({
      mode: intent.kind === "edit" ? "edit" : "create",
      playId: intent.kind === "edit" ? intent.play.playId : undefined,
      body: {
        sequence,
        quarter: form.quarter,
        clock: form.clock,
        possession: form.possession,
        playType: form.playType,
        summary: form.summary || undefined,
        payload,
        participants,
        penalties: form.penalties.map((item) => ({
          penalizedSide: item.penalizedSide,
          code: item.code,
          yards: Number(item.yards),
          result: item.result,
          enforcementType: item.enforcementType,
          timing: item.timing,
          foulSpot: item.enforcementType === "spot" ? { side: item.foulSpotSide, yardLine: Number(item.foulSpotYardLine) } : undefined,
          automaticFirstDown: item.automaticFirstDown,
          lossOfDown: item.lossOfDown,
          replayDown: item.replayDown,
          noPlay: item.noPlay
        }))
      }
    });
  }

  function renderParticipantField(field: ParticipantField) {
    return (
      <label
        className={focusedField === field.key ? "field participant-field-card active" : "field participant-field-card"}
        key={field.key}
      >
        <span>{field.label}</span>
        <input
          value={form[field.key]}
          placeholder={field.hint ?? field.label}
          inputMode="numeric"
          maxLength={3}
          className="participant-number-input"
          onFocus={() => setFocusedField(field.key)}
          onChange={(event) => set(field.key, event.target.value)}
        />
        <small>{field.team === form.possession ? "offense" : "defense"}</small>
      </label>
    );
  }

  return (
    <section className="section-card pad-lg stack-md play-entry-shell" data-testid="play-entry-shell">
      <div className="entry-header">
        <div>
          <div className="eyebrow play-entry-eyebrow">Live entry</div>
          <h2 style={{ margin: "10px 0 0" }}>Play Entry</h2>
          <p className="kicker">{intent.kind === "edit" ? `Editing ${intent.play.sequence}` : intent.kind === "insert" ? `Insert before ${intent.beforePlay.sequence}` : "Append next play"} at sequence {sequence}.</p>
        </div>
        {!viewerMode ? (
          <div className="timeline-actions">
            {intent.kind !== "append" ? <button className="button-secondary button-secondary-light" type="button" onClick={onCancelIntent}>Cancel</button> : null}
            <button className="button-secondary button-secondary-light" data-testid="play-entry-toggle" type="button" onClick={() => setEntryCollapsed((current) => !current)}>
              {entryCollapsed ? "Open entry" : "Collapse entry"}
            </button>
          </div>
        ) : null}
      </div>

      {viewerMode ? (
        <section className="collapsed-entry-card stack-md play-entry-viewer-state" data-testid="play-entry-viewer-state">
          <div className="entry-header">
            <div className="stack-sm">
              <strong>Viewer mode</strong>
              <p className="kicker" style={{ margin: 0 }}>
                Another writer is active. Review live state and recent plays, or use Try writer lease to take control.
              </p>
            </div>
            <span className="chip">Live review</span>
          </div>
        </section>
      ) : entryCollapsed ? (
        <section className="collapsed-entry-card stack-md" data-testid="play-entry-collapsed">
          <div className="entry-header">
            <div className="stack-sm">
              <strong>{currentPlayLabel}</strong>
              <p className="kicker" style={{ margin: 0 }}>
                {disabled ? "Writer lease required before this device can submit plays." : submitting ? "Play is currently submitting." : intent.kind === "edit" ? "Editing the selected play." : intent.kind === "insert" ? "Insert mode is ready." : "Ready for the next snap."}
              </p>
            </div>
            <span className="chip">{form.possession === "home" ? "H" : "V"} | Q{form.quarter}</span>
          </div>
          <div className="timeline-actions">
            <button className="button-primary" type="button" onClick={() => setEntryCollapsed(false)}>Open play entry</button>
          </div>
        </section>
      ) : (
        <>

        <section className="play-entry-command-deck">
          <div className="stack-sm play-entry-stage play-entry-stage-primary">
            <div className="entry-header">
              <div>
                <strong>Play type</strong>
                <p className="kicker" style={{ margin: 0 }}>{playTypeDescription(form.playType)}</p>
              </div>
              <span className="chip play-entry-sequence-chip">Seq {sequence}</span>
            </div>
            <div className="tab-row play-type-grid" data-testid="play-type-selector">
            {playOptionsByPhase[snapshot.currentState.phase].map((option) => (
              <button
                key={option}
                className={option === form.playType ? "tab-button active play-type-button" : "tab-button play-type-button"}
                type="button"
                onClick={() => set("playType", option)}
              >
                {playTypeLabel(option)}
              </button>
            ))}
          </div>
        </div>

      </section>

      {disabled && !viewerMode ? (
        <div className="kicker">
          A writer lease is required before live plays can be submitted. Reacquire the lease or return when this device is the active stat writer.
        </div>
      ) : null}

      {formError ? <div className="error-note">{formError}</div> : null}

      {primaryParticipantFields.length > 0 ? (
        <section className="play-entry-primary-block stack-md" data-testid="play-entry-primary-block">
          <div className="entry-header play-entry-role-header">
            <div>
              <strong>{primarySectionTitle}</strong>
              <p className="kicker" style={{ margin: "6px 0 0" }}>
                {primarySectionCopy}
              </p>
            </div>
          </div>
          <div className="play-entry-primary-grid">
            <section className="participant-panel stack-md play-entry-role-panel">
              <div className="participant-field-grid play-entry-role-grid">
                {primaryParticipantFields.map(renderParticipantField)}
              </div>
              <div className="player-bank play-entry-quick-bank">
                <strong>Recent offense</strong>
                <div className="pill-row">
                  {quickOffense.slice(0, 6).map((entry) => (
                    <button className="chip-button" key={entry.id} type="button" onClick={() => addQuick(entry.jerseyNumber)}>
                      #{entry.jerseyNumber} {entry.displayName}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="play-entry-results-shell stack-sm">
              <div className="entry-header">
                <strong>Result and yardage</strong>
                <span className="chip">Primary result</span>
              </div>

              <div className="form-grid play-entry-detail-grid">
                {showRunFields ? <label className="field"><span>Yards gained / lost</span><input value={form.yards} onChange={(event) => set("yards", event.target.value)} /></label> : null}
                {showPassFields ? <label className="field"><span>Yards gained / lost</span><input value={form.yards} onChange={(event) => set("yards", event.target.value)} /></label> : null}
                {showSackFields ? <label className="field"><span>Yards lost</span><input value={form.yardsLost} onChange={(event) => set("yardsLost", event.target.value)} /></label> : null}
                {showPuntFields || showKickoffFields || form.playType === "field_goal" ? <label className="field"><span>{form.playType === "field_goal" ? "Kick distance" : "Kick / punt yards"}</span><input value={form.kickDistance} onChange={(event) => set("kickDistance", event.target.value)} /></label> : null}
                {showPuntFields || showKickoffFields || showTurnoverFields ? <label className="field"><span>Return yards</span><input value={form.returnYards} onChange={(event) => set("returnYards", event.target.value)} /></label> : null}
                {showRunFields ? <label className="field"><span>Run style</span><select value={form.runKind} onChange={(event) => set("runKind", event.target.value as FormState["runKind"])}><option value="designed">Designed</option><option value="scramble">Scramble</option><option value="quarterback_keep">QB keep</option><option value="reverse">Reverse</option></select></label> : null}
                {showPassFields ? <label className="field"><span>Pass result</span><select value={form.passResult} onChange={(event) => set("passResult", event.target.value as FormState["passResult"])}><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="interception">Interception</option></select></label> : null}
                {showKickTryFields ? <label className="field"><span>Kick result</span><select value={form.kickResult} onChange={(event) => set("kickResult", event.target.value as FormState["kickResult"])}><option value="good">Good</option><option value="no_good">No good</option><option value="blocked">Blocked</option></select></label> : null}
                {showPuntFields || showKickoffFields ? <label className="field"><span>Return result</span><select value={form.returnResult} onChange={(event) => set("returnResult", event.target.value as FormState["returnResult"])}><option value="returned">Returned</option><option value="touchback">Touchback</option><option value="fair_catch">Fair catch</option><option value="out_of_bounds">Out of bounds</option><option value="downed">Downed</option></select></label> : null}
                {showTwoPointFields ? <label className="field"><span>2-pt style</span><select value={form.twoPointStyle} onChange={(event) => set("twoPointStyle", event.target.value as FormState["twoPointStyle"])}><option value="run">Run</option><option value="pass">Pass</option></select></label> : null}
                {showTwoPointFields ? <label className="field"><span>2-pt result</span><select value={form.twoPointResult} onChange={(event) => set("twoPointResult", event.target.value as FormState["twoPointResult"])}><option value="good">Good</option><option value="failed">Failed</option><option value="turnover">Turnover</option></select></label> : null}
                {showTurnoverFields ? <label className="field"><span>Turnover kind</span><select value={form.turnoverKind} onChange={(event) => set("turnoverKind", event.target.value as FormState["turnoverKind"])}><option value="interception_return">Interception</option><option value="fumble_return">Fumble return</option><option value="blocked_kick_return">Blocked kick</option></select></label> : null}
                {showRunFields || showPassFields || showTurnoverFields || showSackFields || showPenaltyOnlyFields ? (
                  <div className="play-entry-toggle-grid field-span-2">
                    {showRunFields || showPassFields ? <label className="checkbox-field"><input type="checkbox" checked={form.firstDown} onChange={(event) => set("firstDown", event.target.checked)} />First down</label> : null}
                    {showRunFields || showPassFields || showTurnoverFields ? <label className="checkbox-field"><input type="checkbox" checked={form.touchdown} onChange={(event) => set("touchdown", event.target.checked)} />Touchdown</label> : null}
                    {showRunFields || showSackFields ? <label className="checkbox-field"><input type="checkbox" checked={form.fumble} onChange={(event) => set("fumble", event.target.checked)} />Fumble</label> : null}
                    {showRunFields || showSackFields ? <label className="checkbox-field"><input type="checkbox" checked={form.fumbleLost} onChange={(event) => set("fumbleLost", event.target.checked)} />Lost fumble</label> : null}
                    {showPenaltyOnlyFields ? <label className="checkbox-field"><input type="checkbox" checked={form.liveBallPenaltyOnly} onChange={(event) => set("liveBallPenaltyOnly", event.target.checked)} />Live-ball penalty play</label> : null}
                  </div>
                ) : null}
                <label className="field field-span-2">
                  <span>Summary override</span>
                  <input value={form.summary} onChange={(event) => set("summary", event.target.value)} />
                </label>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {defensiveParticipantFields.length > 0 ? (
        <section className="play-entry-defensive-section stack-md" data-testid="play-entry-defensive-section">
          <div className="entry-header play-entry-role-header">
            <div>
              <strong>Defense</strong>
              <p className="kicker" style={{ margin: "6px 0 0" }}>
                Minimal tackle, breakup, and takeaway attribution.
              </p>
            </div>
            <button className="mini-button" type="button" onClick={autoFillDefense}>
              Auto-fill defense
            </button>
          </div>
          <div className="participant-field-grid play-entry-role-grid">
            {defensiveParticipantFields.map(renderParticipantField)}
          </div>
          <div className="pill-row play-entry-quick-defense">
            {quickDefense.slice(0, 6).map((entry) => (
              <button className="chip-button" key={entry.id} type="button" onClick={() => addQuick(entry.jerseyNumber)}>
                #{entry.jerseyNumber} {entry.displayName}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {showPenaltyOnlyFields || form.penalties.length > 0 ? (
        <details className="play-entry-secondary" open={showPenaltyOnlyFields}>
          <summary className="play-entry-secondary-summary">
            <span>Penalty section</span>
            <span className="chip">{form.penalties.length} logged</span>
          </summary>
          <section className="play-entry-overlay-shell stack-sm" style={{ marginTop: 14 }}>
            <div className="entry-header">
              <strong>Penalty details</strong>
              <button className="button-secondary button-secondary-light" type="button" onClick={() => set("penalties", [...form.penalties, penaltyDefaults(form.possession)])}>Add penalty</button>
            </div>
            <div className="pill-row">
              {penaltyPresets.map((preset) => (
                <button
                  className="chip-button"
                  key={preset.key}
                  type="button"
                  onClick={() => setForm((current) => preset.apply(current))}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {form.penalties.map((item) => (
              <div className="penalty-card" key={item.id}>
                <div className="form-grid">
                  <label className="field"><span>On</span><select value={item.penalizedSide} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, penalizedSide: event.target.value as TeamSide } : entry))}><option value="home">Home</option><option value="away">Away</option></select></label>
                  <label className="field"><span>Code</span><input value={item.code} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, code: event.target.value } : entry))} /></label>
                  <label className="field"><span>Yards</span><input value={item.yards} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, yards: event.target.value } : entry))} /></label>
                  <label className="field"><span>Result</span><select value={item.result} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, result: event.target.value as PenaltyDraft["result"] } : entry))}><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="offsetting">Offsetting</option></select></label>
                  <label className="field"><span>Enforcement</span><select value={item.enforcementType} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, enforcementType: event.target.value as PenaltyDraft["enforcementType"] } : entry))}><option value="previous_spot">Previous</option><option value="spot">Spot</option><option value="dead_ball">Dead ball</option><option value="succeeding_spot">Succeeding</option></select></label>
                  <label className="field"><span>Timing</span><select value={item.timing} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, timing: event.target.value as PenaltyDraft["timing"] } : entry))}><option value="live_ball">Live ball</option><option value="dead_ball">Dead ball</option><option value="post_possession">Post-possession</option><option value="post_score">Post-score</option></select></label>
                  {item.enforcementType === "spot" ? <><label className="field"><span>Spot side</span><select value={item.foulSpotSide} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, foulSpotSide: event.target.value as TeamSide } : entry))}><option value="home">Home</option><option value="away">Away</option></select></label><label className="field"><span>Spot yard</span><input value={item.foulSpotYardLine} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, foulSpotYardLine: event.target.value } : entry))} /></label></> : null}
                  <label className="checkbox-field"><input type="checkbox" checked={item.automaticFirstDown} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, automaticFirstDown: event.target.checked } : entry))} />Auto first</label>
                  <label className="checkbox-field"><input type="checkbox" checked={item.lossOfDown} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, lossOfDown: event.target.checked } : entry))} />Loss down</label>
                  <label className="checkbox-field"><input type="checkbox" checked={item.replayDown} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, replayDown: event.target.checked } : entry))} />Replay</label>
                  <label className="checkbox-field"><input type="checkbox" checked={item.noPlay} onChange={(event) => set("penalties", form.penalties.map((entry) => entry.id === item.id ? { ...entry, noPlay: event.target.checked } : entry))} />No play</label>
                </div>
                <button className="mini-button" type="button" onClick={() => set("penalties", form.penalties.filter((entry) => entry.id !== item.id))}>Remove</button>
              </div>
            ))}
          </section>
        </details>
      ) : null}

      <section className="play-entry-footer">
      {!viewerMode ? (
        <div className="entry-actions play-entry-submit-wrap" data-testid="submit-controls">
          <button className="button-primary" data-testid="submit-play-button" disabled={disabled || submitting} type="button" onClick={() => void submit()}>
            {disabled
              ? "Writer lease required"
              : intent.kind === "edit"
                ? submitting
                  ? "Saving..."
                  : "Save edit"
                : submitting
                  ? "Submitting..."
                  : "Submit play"}
          </button>
        </div>
      ) : null}
      </section>
        </>
      )}
    </section>
  );
}
