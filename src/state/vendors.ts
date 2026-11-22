// The vendor rolodex on this device (event-bridge.vendors.v1), merged with the team's read-only list from
// public/config/vendors.json when there is one.
import { useMemo } from "react";
import { useConfig } from "../config/context";
import { isVendor, mergeVendors } from "../lib/vendors";
import { readList, useStoredList } from "./local";

export const VENDORS_KEY = "event-bridge.vendors.v1";
export const VENDORS_FORMAT = "event-bridge.vendors";

export function useVendors() {
  const { teamVendors } = useConfig();
  const store = useStoredList(VENDORS_KEY, isVendor);
  const all = useMemo(() => mergeVendors(teamVendors ?? [], store.list), [teamVendors, store.list]);
  return { ...store, all };
}

/** Names for the expense dialog's "Paid to" suggestions, without loading the whole page. */
export const vendorNames = () => readList(VENDORS_KEY, isVendor).map((v) => v.name);
