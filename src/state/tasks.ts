// The team's own tasks on this device, in event-bridge.tasks.v1. Checklist tasks stay on their proposals.
import { isTeamTask } from "../lib/tasks";
import { readList } from "./local";

export const TASKS_KEY = "event-bridge.tasks.v1";
export const TASKS_FORMAT = "event-bridge.tasks";
export const readTeamTasks = () => readList(TASKS_KEY, isTeamTask);
