import { useMemo } from "react";
import { ConfigContext, useConfig } from "../config/context";
import { snapshotProposal, type PageSnapshot } from "../lib/proposalPage";
import ProposalPreview from "./ProposalPreview";

/**
 * A proposal shared as a web page, in the theme the planner chose. The theme is scoped to this element
 * (data-page-theme), so the rest of the site keeps the visitor's own. Labels and photos come from the snapshot;
 * the logo, contact and company details come from this site's own brand.json.
 */
export default function ProposalPage({ snapshot }: { snapshot: PageSnapshot }) {
  const base = useConfig();
  const config = useMemo(
    () => ({
      ...base,
      catalog: {
        ...base.catalog,
        eventTypes: snapshot.catalog.eventTypes,
        ceremonyStyles: snapshot.catalog.ceremonyStyles,
        categories: snapshot.catalog.categories.length ? snapshot.catalog.categories : base.catalog.categories,
      },
    }),
    [base, snapshot],
  );
  return (
    <div className="proposal-page" data-page-theme={snapshot.theme}>
      <ConfigContext.Provider value={config}>
        <ProposalPreview p={snapshotProposal(snapshot)} dated={snapshot.dated} />
      </ConfigContext.Provider>
    </div>
  );
}
