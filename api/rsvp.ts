import { route } from "../server/deps.js";
import { rsvpRespond } from "../server/rsvp.js";

// a guest reads their invitation and replies (public: the link token and personal code are the key)
export default { fetch: route(rsvpRespond) };
