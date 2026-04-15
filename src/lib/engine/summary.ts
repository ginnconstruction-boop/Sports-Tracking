import type {
  ExtraPointPlayPayload,
  FieldGoalPlayPayload,
  KickoffPlayPayload,
  KneelPlayPayload,
  PassPlayPayload,
  PlayRecord,
  PuntPlayPayload,
  RunPlayPayload,
  SackPlayPayload,
  SpikePlayPayload,
  TurnoverPlayPayload,
  TwoPointTryPlayPayload
} from "@/lib/domain/play-log";

export function buildPlaySummary(play: PlayRecord): string {
  if (play.summary) {
    return play.summary;
  }

  switch (play.playType) {
    case "run": {
      const payload = play.payload as RunPlayPayload;
      return `#${payload.ballCarrierNumber} runs for ${payload.yards} yards.`;
    }
    case "pass": {
      const payload = play.payload as PassPlayPayload;
      if (payload.result === "incomplete") {
        return `#${payload.passerNumber} incomplete pass.`;
      }
      if (payload.result === "interception") {
        return `#${payload.passerNumber} is intercepted.`;
      }
      return `#${payload.passerNumber} completes to #${payload.targetNumber ?? "?"} for ${payload.yards} yards.`;
    }
    case "sack": {
      const payload = play.payload as SackPlayPayload;
      return `#${payload.quarterbackNumber} sacked for ${payload.yardsLost} yards.`;
    }
    case "kneel": {
      const payload = play.payload as KneelPlayPayload;
      return `#${payload.quarterbackNumber} kneels for ${payload.yardsLost} yards lost.`;
    }
    case "spike": {
      const payload = play.payload as SpikePlayPayload;
      return `#${payload.quarterbackNumber} spikes the ball.`;
    }
    case "punt": {
      const payload = play.payload as PuntPlayPayload;
      return `Punt for ${payload.puntDistance} yards.`;
    }
    case "kickoff": {
      const payload = play.payload as KickoffPlayPayload;
      return `Kickoff for ${payload.kickDistance} yards.`;
    }
    case "extra_point": {
      const payload = play.payload as ExtraPointPlayPayload;
      return `Extra point ${payload.result}.`;
    }
    case "two_point_try": {
      const payload = play.payload as TwoPointTryPlayPayload;
      return `Two-point try ${payload.result}.`;
    }
    case "field_goal": {
      const payload = play.payload as FieldGoalPlayPayload;
      return `Field goal ${payload.result}.`;
    }
    case "turnover": {
      const payload = play.payload as TurnoverPlayPayload;
      return `Turnover return for ${payload.returnYards} yards.`;
    }
    case "penalty":
      return play.penalties[0] ? `${play.penalties[0].code} penalty.` : "Penalty-only play.";
  }
}
