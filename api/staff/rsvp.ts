import { route } from "../../server/deps.js";
import { rsvpLinks } from "../../server/rsvp.js";

// staff create, refresh, read and turn off a wedding's RSVP link
export default { fetch: route(rsvpLinks) };
