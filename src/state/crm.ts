// Enquiries (leads) on this device, in event-bridge.leads.v1. The CRM page edits them; the Dashboard only reads.
import { isLead } from "../lib/crm";
import { readList } from "./local";

export const LEADS_KEY = "event-bridge.leads.v1";
export const LEADS_FORMAT = "event-bridge.leads";
export const readLeads = () => readList(LEADS_KEY, isLead);
