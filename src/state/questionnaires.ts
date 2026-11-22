// Questionnaire templates on this device (event-bridge.questionnaires.v1), with the team's read-only ones from
// public/config/questionnaires.json, or the built-in one when that file is missing.
import { useMemo } from "react";
import { useConfig } from "../config/context";
import { DEFAULT_QUESTIONNAIRE, isTemplate } from "../lib/questionnaires";
import { useStoredList } from "./local";

export const QUESTIONNAIRES_KEY = "event-bridge.questionnaires.v1";
export const QUESTIONNAIRES_FORMAT = "event-bridge.questionnaires";

export function useQuestionnaires() {
  const { teamQuestionnaires } = useConfig();
  const store = useStoredList(QUESTIONNAIRES_KEY, isTemplate);
  const all = useMemo(() => {
    const team = (teamQuestionnaires ?? [DEFAULT_QUESTIONNAIRE]).filter((t) => !store.list.some((m) => m.id === t.id)).map((t) => ({ ...t, team: true }));
    return [...team, ...store.list];
  }, [teamQuestionnaires, store.list]);
  return { ...store, all };
}
