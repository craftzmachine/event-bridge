import { route } from "../../server/deps.js";
import { viewRespond } from "../../server/visualize.js";

// Vercel runs `export default { fetch }` as a Web Request → Response handler (a bare default function would be
// treated as the legacy Node (req, res) signature and never answer)
export default { fetch: route(viewRespond) };
