/* ISDA Master Agreement Jigsaw — planning tool. Not legal advice. */

/* ---------------------------------------------------------------------- */
/* 1. DATA MODEL                                                          */
/* ---------------------------------------------------------------------- */

const money = (n) => "$" + Number(n).toLocaleString("en-US");

const RATING_TIERS = [
  { key: "aa", label: "AA- or better", multiplier: 1.5 },
  { key: "a", label: "A- to A+", multiplier: 1.0 },
  { key: "bbb", label: "BBB- to BBB+", multiplier: 0.5 },
  { key: "sub", label: "BB+ or below / unrated", multiplier: 0.15 },
];

function ratingTier(key) {
  return RATING_TIERS.find((r) => r.key === key) || RATING_TIERS[1];
}

// RATING_TIERS is ordered best-to-worst; a lower index is a better rating.
function ratingTierIndex(key) {
  const i = RATING_TIERS.findIndex((r) => r.key === key);
  return i === -1 ? 1 : i;
}

// For dualNumber fields flagged `ratingLinkable`, `a`/`b` are anchor amounts
// pegged to an AA- counterparty. When ratingLinked is on, the amount actually
// in force scales with each party's current rating tier.
function effectiveDual(field, val) {
  if (!field.ratingLinkable || !val || !val.ratingLinked) {
    return { a: val ? val.a : 0, b: val ? val.b : 0 };
  }
  const roundTo1000 = (n) => Math.round(n / 1000) * 1000;
  return {
    a: roundTo1000(val.a * ratingTier(val.dealerRating).multiplier),
    b: roundTo1000(val.b * ratingTier(val.counterpartyRating).multiplier),
  };
}

const PIECES = {
  frame: {
    label: "Frame (Base)",
    fields: [
      {
        key: "governingLaw",
        label: "Governing Law",
        type: "select",
        options: [
          { value: "NY", label: "New York", favors: "neutral" },
          { value: "English", label: "English", favors: "neutral" },
          { value: "Irish", label: "Irish", favors: "neutral" },
          { value: "French", label: "French (FBF-compatible)", favors: "neutral" },
          { value: "Japanese", label: "Japanese", favors: "neutral" },
          { value: "Indian", label: "Indian law (domestic INR derivatives — CCIL/FEDAI framework)", favors: "neutral" },
        ],
        default: "NY",
      },
      {
        key: "multibranch",
        label: "Multibranch Party (10(a))",
        type: "select",
        options: [
          { value: "yes", label: "Multibranch — may book via any Office", favors: "dealer" },
          { value: "no", label: "Single Branch only", favors: "buyside" },
        ],
        default: "yes",
      },
      {
        key: "paymentNetting",
        label: "Payment Netting — Section 2(c)",
        type: "select",
        options: [
          { value: "all", label: "Multiple Transaction Payment Netting — all Transactions", favors: "dealer" },
          { value: "sameCurrency", label: "Same currency / same date only (ISDA default)", favors: "neutral" },
          { value: "none", label: "Netting disapplied", favors: "buyside" },
        ],
        default: "sameCurrency",
      },
      {
        key: "disputeResolution",
        label: "Jurisdiction / Dispute Resolution (13(b))",
        type: "select",
        options: [
          { value: "nyExclusive", label: "New York courts, exclusive jurisdiction", favors: "neutral" },
          { value: "nyNonExclusive", label: "New York courts, non-exclusive jurisdiction (ISDA default)", favors: "neutral" },
          { value: "londonExclusive", label: "English courts, exclusive jurisdiction", favors: "neutral" },
          { value: "londonNonExclusive", label: "English courts, non-exclusive jurisdiction", favors: "neutral" },
          { value: "arbitrationLCIA", label: "Arbitration (LCIA/ICC) instead of courts", favors: "buyside" },
          { value: "indianCourtsExclusive", label: "Indian courts (e.g., Bombay/Delhi High Court), exclusive jurisdiction", favors: "neutral" },
          { value: "indianArbitration", label: "Arbitration under the Arbitration and Conciliation Act, 1996 (India), seated in Mumbai/Delhi/GIFT City", favors: "neutral" },
        ],
        default: "nyNonExclusive",
      },
      {
        key: "transferAssignment",
        label: "Transfer / Assignment (Section 7)",
        type: "select",
        options: [
          { value: "mutualConsent", label: "Consent of both parties required for any transfer (ISDA default, not unreasonably withheld)", favors: "neutral" },
          { value: "consentWithDeemedTimer", label: "Consent required, but deemed given if no objection within a stated number of Business Days — eases novation/portfolio compression", favors: "dealer" },
          { value: "dealerFreeOnAffiliate", label: "Dealer may transfer freely to an Affiliate or on a merger/reorganization without consent", favors: "dealer" },
          { value: "counterpartyConsentAlways", label: "Counterparty consent required for any transfer, including to Affiliates, no exceptions", favors: "buyside" },
        ],
        default: "mutualConsent",
      },
      {
        key: "sovereignImmunityWaiver",
        label: "Waiver of Jury Trial / Sovereign Immunity",
        type: "select",
        options: [
          { value: "fullWaiver", label: "Full waiver of jury trial and of sovereign/state immunity from suit and execution", favors: "dealer" },
          { value: "limitedWaiverCentralBankCarveout", label: "Waiver of suit, but immunity from execution preserved for certain asset classes (e.g., central bank reserves, diplomatic property)", favors: "buyside" },
          { value: "noWaiver", label: "No waiver — full sovereign/state immunity retained", favors: "buyside", aggressive: true },
        ],
        default: "limitedWaiverCentralBankCarveout",
        niche: true,
      },
    ],
  },

  core: {
    label: "Core (Credit / Triggers)",
    fields: [
      {
        key: "crossDefaultThreshold",
        label: "Cross Default — Threshold Amount",
        type: "dualNumber",
        polarity: 1,
        weight: 15,
        ratingLinkable: true,
        partyALabel: "Dealer",
        partyBLabel: "Counterparty",
        default: { a: 25000000, b: 25000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
      },
      {
        key: "crossDefaultType",
        label: "Cross Default — Trigger Scope",
        type: "select",
        options: [
          { value: "defaultOnly", label: "Actual default only (payment/acceleration already occurred)", favors: "buyside" },
          { value: "defaultOrAcceleration", label: "Default or becoming capable of being declared due (broad)", favors: "dealer" },
        ],
        default: "defaultOrAcceleration",
      },
      {
        key: "specifiedIndebtednessScope",
        label: "Specified Indebtedness — Carve-Outs (Section 14)",
        type: "select",
        options: [
          { value: "broad", label: "Unamended Section 14 definition — no carve-outs", favors: "dealer" },
          { value: "standardBankingCarveout", label: "Excludes deposits taken in the ordinary course of a party's banking business", favors: "neutral" },
          { value: "fundFinancingCarveout", label: "Also excludes repo/reverse repo, securities lending, and margin financing entered into in the ordinary course of a fund counterparty's portfolio financing (subject to a payment-default cure period)", favors: "buyside" },
        ],
        default: "standardBankingCarveout",
      },
      {
        key: "specifiedEntities",
        label: "Specified Entities",
        type: "select",
        options: [
          { value: "none", label: "None specified", favors: "buyside" },
          { value: "namedSubs", label: "Named material subsidiaries only", favors: "neutral" },
          { value: "csProvidersOnly", label: "Credit Support Providers only", favors: "dealer" },
          { value: "allAffiliates", label: "All Affiliates (present and future, worldwide)", favors: "dealer", aggressive: true },
        ],
        default: "namedSubs",
      },
      {
        key: "ates",
        label: "Additional Termination Events",
        type: "multiselect",
        options: [
          { value: "navDecline", label: "NAV Decline Trigger", favors: "dealer" },
          { value: "keyPerson", label: "Key Person Event", favors: "dealer" },
          { value: "downgrade", label: "Ratings Downgrade Trigger", favors: "dealer" },
        ],
        default: [],
        aggressiveIf: (vals) => vals.length >= 3,
      },
      {
        key: "bankruptcyCarveout",
        label: "Bankruptcy Event of Default — Carve-Outs (5(a)(vii))",
        type: "select",
        options: [
          { value: "standardUnmodified", label: "Unmodified printed-form Bankruptcy Event of Default", favors: "neutral" },
          { value: "compressedGracePeriod", label: "Compressed grace period on the petition-dismissal / execution-levy limbs (e.g., 15 days instead of 30)", favors: "dealer" },
          { value: "regulatedEntityCarveout", label: "Carve-out for special resolution/administration regimes of regulated banks/insurers, or technical/non-payment insolvency events of a regulated fund structure (e.g., solvent wind-down)", favors: "buyside" },
        ],
        default: "standardUnmodified",
      },
      {
        // AET applying TO a party benefits the OTHER party — it lets the
        // other side close out automatically on that party's insolvency
        // without depending on notice, which is exactly what an automatic
        // stay can otherwise block. So each party's own election is scored
        // from the other party's perspective (favorsA/favorsB below), not a
        // single shared "favors" — this is why real Schedules elect it
        // separately per party rather than as one global switch.
        key: "aet",
        label: "Automatic Early Termination (6(a))",
        type: "dualSelect",
        partyALabel: "Dealer",
        partyBLabel: "Counterparty",
        options: [
          { value: "yes", label: "Applies (terminates automatically on that party's insolvency)", favorsA: "buyside", favorsB: "dealer" },
          { value: "no", label: "Disapplied (manual designation required)", favorsA: "dealer", favorsB: "buyside" },
        ],
        default: { a: "no", b: "yes" },
      },
      {
        key: "processAgent",
        label: "Process Agent (required if AET applies to either party)",
        type: "text",
        conditionalOn: { key: "aet", test: (val) => val.a === "yes" || val.b === "yes" },
        default: "",
        placeholder: "e.g., CT Corporation System, New York",
      },
      {
        key: "creditEventUponMerger",
        label: "Credit Event Upon Merger (5(b)(iv))",
        type: "select",
        options: [
          { value: "notApplicable", label: "Not applicable", favors: "buyside" },
          { value: "bothParties", label: "Applicable to both parties (symmetric)", favors: "neutral" },
          { value: "counterpartyOnly", label: "Applicable to Counterparty only (asymmetric)", favors: "dealer", aggressive: true },
        ],
        default: "notApplicable",
      },
      {
        key: "taxEventUponMerger",
        label: "Tax Event Upon Merger (Section 5(b))",
        type: "select",
        options: [
          { value: "applicable", label: "Applicable to both parties, standard burden-sharing negotiation period before termination", favors: "neutral" },
          { value: "excluded", label: "Excluded / disapplied — a party's own corporate action can't tax-trigger a termination right against it", favors: "buyside" },
        ],
        default: "applicable",
      },
      {
        key: "terminationCurrency",
        label: "Termination Currency (6(e))",
        type: "select",
        options: [
          { value: "USD", label: "USD", favors: "neutral" },
          { value: "EUR", label: "EUR", favors: "neutral" },
          { value: "GBP", label: "GBP", favors: "neutral" },
          { value: "baseCurrency", label: "Base Currency (currency of the greater exposure)", favors: "neutral" },
        ],
        default: "USD",
      },
      {
        key: "closeoutMethodology",
        label: "Close-out Valuation Methodology (6(e))",
        type: "select",
        options: [
          // Close-out Amount is the modern market-standard election (a good-faith,
          // commercially-reasonable-procedures test), not a dealer-skewed one —
          // only Loss (max determining-party discretion) actually carries that skew.
          { value: "closeOutAmount2002", label: "Close-out Amount (2002 form — single determining party, commercially reasonable procedures)", favors: "neutral" },
          { value: "marketQuotation1992", label: "Market Quotation (1992 form — third-party dealer quotes)", favors: "buyside" },
          { value: "loss1992", label: "Loss (1992 form — non-defaulting party's own reasonable determination)", favors: "dealer", aggressive: true },
        ],
        default: "closeOutAmount2002",
      },
      {
        key: "creditSupportProvider",
        label: "Credit Support Provider / Parent Guarantee",
        type: "select",
        options: [
          { value: "none", label: "No Credit Support Provider named for either party", favors: "neutral" },
          { value: "dealerGuarantorOnly", label: "Dealer's parent/affiliate guarantees the Dealer's obligations only", favors: "buyside" },
          { value: "counterpartyGuarantorOnly", label: "Counterparty's parent/affiliate guarantees the Counterparty's obligations only", favors: "dealer" },
          { value: "mutualGuarantees", label: "Both parties' obligations are guaranteed by a Credit Support Provider", favors: "neutral" },
        ],
        default: "none",
      },
      {
        key: "failureToPayGracePeriod",
        label: "Failure to Pay or Deliver — Operational Error Carve-Out (5(a)(i))",
        type: "select",
        options: [
          { value: "none", label: "Unamended — any failure to pay/deliver when due is an Event of Default, no carve-out", favors: "dealer" },
          { value: "operationalCarveout", label: "A failure caused solely by an operational, administrative, or technical error is not an Event of Default if cured within 5 Local Business Days of written notice", favors: "buyside" },
        ],
        default: "none",
      },
    ],
  },

  attachments: {
    label: "Attachments (CSA)",
    fields: [
      {
        key: "csaStructure",
        label: "CSA / Collateral Structure",
        type: "select",
        options: [
          { value: "vmTitleTransferEnglish", label: "VM CSA — Title Transfer (English law)", favors: "neutral" },
          { value: "vmPledgeNY", label: "VM CSA — Pledge Annex (New York law)", favors: "neutral" },
          { value: "vmImBilateral", label: "VM + IM Bilateral (Prudential/CFTC UMR compliant)", favors: "buyside" },
        ],
        default: "vmPledgeNY",
      },
      {
        key: "independentAmount",
        label: "Independent Amount",
        type: "dualNumber",
        polarity: -1,
        weight: 15,
        partyALabel: "Dealer posts",
        partyBLabel: "Counterparty posts",
        default: { a: 0, b: 0 },
      },
      {
        key: "threshold",
        label: "Threshold",
        type: "dualNumber",
        polarity: 1,
        weight: 15,
        ratingLinkable: true,
        partyALabel: "Dealer",
        partyBLabel: "Counterparty",
        default: { a: 10000000, b: 10000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
      },
      {
        key: "mta",
        label: "Minimum Transfer Amount (MTA)",
        type: "dualNumber",
        polarity: 1,
        weight: 8,
        partyALabel: "Dealer",
        partyBLabel: "Counterparty",
        default: { a: 250000, b: 250000 },
      },
      {
        key: "eligibleCollateral",
        label: "Eligible Collateral",
        type: "multiselect",
        options: [
          { value: "cashUSD", label: "Cash — USD", favors: "neutral" },
          { value: "cashOther", label: "Cash — other G7 currency", favors: "neutral" },
          { value: "usTreasuries", label: "US Treasuries / Govt Bonds", favors: "buyside" },
          { value: "nonUSGovt", label: "Non-US Government Bonds", favors: "buyside" },
          { value: "equities", label: "Listed Equities", favors: "buyside", aggressive: true },
          { value: "mmf", label: "Money Market Fund shares", favors: "buyside" },
          { value: "inrGSecs", label: "Indian Government Securities (G-Secs, onshore)", favors: "buyside" },
          { value: "inrCorpBonds", label: "Indian AAA Corporate Bonds (onshore, CRISIL/ICRA/CARE-rated)", favors: "buyside", aggressive: true },
        ],
        default: ["cashUSD"],
      },
      {
        key: "haircutLevel",
        label: "Haircut Schedule",
        type: "select",
        options: [
          { value: "cashOnlyZero", label: "Cash-only, zero haircut", favors: "buyside" },
          { value: "standard", label: "ISDA/SIMM standard schedule (e.g., 0% cash, 0.5%–4% G7 govt bonds, 8% EM govt bonds, 15% equities)", favors: "neutral" },
          { value: "aggressive", label: "Bespoke aggressive haircuts (dealer-set, typically +5–10pts over standard)", favors: "dealer" },
        ],
        default: "standard",
      },
      {
        key: "interestRateCashCollateral",
        label: "Interest Rate on Posted Cash Collateral",
        type: "select",
        options: [
          { value: "sofrFlat", label: "Relevant RFR (e.g., SOFR/€STR) flat", favors: "neutral" },
          { value: "sofrMinusSpread", label: "Relevant RFR minus a negotiated spread (e.g., SOFR − 25bps)", favors: "dealer" },
          { value: "fedFundsFlat", label: "Fed Funds (O/N) flat — legacy election", favors: "neutral" },
        ],
        default: "sofrFlat",
      },
      {
        key: "valuationAgent",
        label: "Valuation Agent (CSA Para 13)",
        type: "select",
        options: [
          { value: "dealerSole", label: "Dealer, sole Valuation Agent", favors: "dealer" },
          { value: "jointDisclosed", label: "Dealer as Valuation Agent, methodology disclosed, with a dispute mechanism", favors: "neutral" },
          { value: "counterpartyOrThirdParty", label: "Counterparty, or an independent third party", favors: "buyside" },
        ],
        default: "dealerSole",
      },
      {
        key: "disputeResolutionTiming",
        label: "Collateral Dispute Resolution Timing (CSA Para 5)",
        type: "select",
        options: [
          { value: "oneLocalBusinessDay", label: "1 Local Business Day (CSA default)", favors: "neutral" },
          { value: "sameDay", label: "Same-day recalculation and resolution", favors: "buyside" },
          { value: "extended", label: "Extended (3+ Local Business Days)", favors: "dealer" },
        ],
        default: "oneLocalBusinessDay",
      },
      {
        // Mirrors the eligibleCollateral/haircutLevel convention: restricting
        // the poster's basket (tight caps) is taker-protective (dealer here,
        // consistent with haircutLevel's "aggressive"=dealer), while no caps at
        // all preserves the poster's flexibility (buyside), same direction as
        // cashOnlyZero haircuts.
        key: "concentrationLimits",
        label: "Concentration Limits on Non-Cash Collateral",
        type: "select",
        options: [
          { value: "none", label: "No concentration limits — any eligible non-cash collateral type/issuer accepted without a cap", favors: "buyside" },
          { value: "standard", label: "Standard caps (e.g., 20% of portfolio per issuer/asset class)", favors: "neutral" },
          { value: "tight", label: "Tight caps (e.g., 10% per issuer, single-obligor limits)", favors: "dealer" },
        ],
        default: "standard",
      },
      {
        // Unlike custodian/rehypothecation/substitution rights, this doesn't
        // consistently transfer value to a fixed side: whichever party happens
        // to be in the money on a given Valuation Date is the one the demand
        // step affects, and that flips with mark-to-market. Left neutral rather
        // than forcing a dealer/buyside split onto a genuinely procedural point.
        key: "demandMechanic",
        label: "Transfer Demand Mechanic (Title Transfer only)",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmTitleTransferEnglish" },
        options: [
          { value: "onDemand", label: "Transfer only upon demand following each Valuation Date (English CSA default)", favors: "neutral" },
          { value: "automatic", label: "Automatic transfer without a separate demand", favors: "neutral" },
        ],
        default: "onDemand",
        niche: true,
      },
      {
        key: "distributionsElection",
        label: "Distributions Election (Title Transfer only)",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmTitleTransferEnglish" },
        options: [
          { value: "included", label: "Distributions (coupons/dividends on transferred securities) paid to Transferor", favors: "buyside" },
          { value: "excluded", label: "No Distributions election — economic benefit stays with Transferee", favors: "dealer" },
        ],
        default: "included",
        niche: true,
      },
      {
        key: "custodianArrangement",
        label: "Custodian Arrangement (Pledge only)",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmPledgeNY" },
        options: [
          { value: "none", label: "No third-party custodian — Secured Party holds collateral directly", favors: "dealer", aggressive: true },
          { value: "thirdParty", label: "Third-party custodian (Eligible Custodian criteria negotiated)", favors: "neutral" },
          { value: "triParty", label: "Tri-party custodian arrangement", favors: "buyside" },
        ],
        default: "thirdParty",
        niche: true,
      },
      {
        key: "rehypothecationRights",
        label: "Right to Use / Rehypothecate Collateral (Pledge only, Para 6(c))",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmPledgeNY" },
        options: [
          { value: "full", label: "Full right to sell, pledge, rehypothecate, or otherwise use posted collateral", favors: "dealer", aggressive: true },
          { value: "recallable", label: "Rehypothecation permitted, subject to a recall right on notice", favors: "neutral" },
          { value: "none", label: "No rehypothecation — pure pledge, collateral held segregated", favors: "buyside" },
        ],
        default: "recallable",
        niche: true,
      },
      {
        key: "substitutionConsent",
        label: "Substitution Consent (Pledge only, Para 4(d))",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmPledgeNY" },
        options: [
          { value: "automatic", label: "Automatic substitution on notice, no consent required", favors: "buyside" },
          { value: "consentRequired", label: "Secured Party consent required for substitution (not unreasonably withheld)", favors: "neutral" },
          { value: "soleDiscretion", label: "Substitution subject to Secured Party's sole discretion", favors: "dealer" },
        ],
        default: "consentRequired",
        niche: true,
      },
      {
        // Both parties exchange IM bilaterally under UMR regardless of method,
        // so this isn't a one-sided leverage point like calcAgent/valuationAgent —
        // it's a genuine two-way tradeoff (SIMM: lower IM, but needs model
        // governance/backtesting infrastructure a smaller counterparty may lack;
        // Schedule: higher IM funding cost, but no governance burden). Left
        // neutral rather than assuming the higher-IM option always favors buyside.
        key: "imCalculationMethod",
        label: "IM Calculation Method (Bilateral IM only)",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmImBilateral" },
        options: [
          { value: "simm", label: "ISDA SIMM (model-based, requires ongoing backtesting)", favors: "neutral" },
          { value: "standardizedSchedule", label: "Standardized/Regulatory Schedule (grid-based, more conservative, no backtesting)", favors: "neutral" },
        ],
        default: "simm",
        niche: true,
      },
      {
        key: "segregationStructure",
        label: "IM Segregation Structure (Bilateral IM only)",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmImBilateral" },
        options: [
          { value: "thirdPartySegregated", label: "Third-party segregated account, no rehypothecation (UMR-mandated)", favors: "neutral" },
          { value: "triParty", label: "Tri-party custodian manages eligibility and valuation", favors: "buyside" },
        ],
        default: "thirdPartySegregated",
        niche: true,
      },
      {
        key: "custodianApproval",
        label: "IM Custodian Approval (Bilateral IM only)",
        type: "select",
        conditionalOn: { key: "csaStructure", value: "vmImBilateral" },
        options: [
          { value: "mutualConsent", label: "Custodian selection subject to mutual consent of both parties", favors: "buyside" },
          { value: "securedPartyDiscretion", label: "Secured Party selects custodian from an approved list, sole discretion", favors: "dealer" },
        ],
        default: "mutualConsent",
        niche: true,
      },
    ],
  },

  edge: {
    label: "Edge (Ops / Tax)",
    fields: [
      {
        key: "taxReps",
        label: "Tax Representations",
        type: "multiselect",
        options: [
          { value: "fatca", label: "FATCA representations", favors: "neutral" },
          { value: "s871m", label: "Section 871(m) representations", favors: "neutral" },
          { value: "s195India", label: "Indian withholding tax (Section 195 Income-tax Act / DTAA reliance)", favors: "neutral" },
        ],
        default: ["fatca"],
      },
      {
        key: "grossUp",
        label: "Withholding Tax Gross-Up (2(d))",
        type: "select",
        options: [
          { value: "yes", label: "Payer gross-up on Indemnifiable Tax", favors: "buyside" },
          { value: "no", label: "No gross-up (silent / withholding borne by payee)", favors: "dealer" },
        ],
        default: "no",
      },
      {
        key: "documentsDelivered",
        label: "Documents to be Delivered (4(a))",
        type: "multiselect",
        options: [
          { value: "taxForms", label: "Tax forms (W-8/W-9)", favors: "neutral" },
          { value: "boardRes", label: "Board / authorization resolutions", favors: "neutral" },
          { value: "legalOpinion", label: "Legal opinion", favors: "neutral" },
          { value: "csDocs", label: "Credit support documents", favors: "neutral" },
          { value: "processAgentLetter", label: "Process agent acceptance letter", favors: "neutral" },
          { value: "financialStatements", label: "Annual audited financial statements and periodic NAV statements", favors: "neutral" },
        ],
        default: ["taxForms"],
      },
      {
        key: "calcAgent",
        label: "Calculation Agent",
        type: "select",
        options: [
          { value: "dealerSole", label: "Dealer, sole", favors: "dealer" },
          { value: "counterpartySole", label: "Counterparty, sole", favors: "buyside" },
          { value: "joint", label: "Joint / dispute-resolution mechanism", favors: "neutral" },
          { value: "thirdParty", label: "Independent third party", favors: "buyside" },
        ],
        default: "dealerSole",
      },
      {
        key: "defaultInterestSpread",
        label: "Default Interest / Overdue Amounts (9(h))",
        type: "select",
        options: [
          { value: "standard1pct", label: "1% over the applicable base rate, symmetric (ISDA default)", favors: "neutral" },
          { value: "symmetricNegotiated", label: "Same negotiated formula applies to both parties regardless of default", favors: "buyside" },
          { value: "asymmetricCostOfFunds", label: "Defaulting party pays non-defaulting party's cost of funds + spread (asymmetric)", favors: "dealer", aggressive: true },
        ],
        default: "standard1pct",
        niche: true,
      },
      {
        key: "protocolAdherence",
        label: "ISDA Protocol Adherence",
        type: "multiselect",
        options: [
          { value: "vm2016", label: "ISDA 2016 Variation Margin Protocol", favors: "neutral" },
          { value: "iborFallbacks", label: "ISDA IBOR Fallbacks Protocol / Supplement", favors: "neutral" },
          { value: "resolutionStay", label: "ISDA Resolution Stay Jurisdictional Modular Protocol (US QFC Stay Rules)", favors: "neutral" },
          { value: "masterAgreementProtocol2002", label: "ISDA 2002 Master Agreement Protocol", favors: "neutral" },
          { value: "emirRiskMitigation", label: "EMIR Risk Mitigation / Portfolio Reconciliation Protocol", favors: "neutral" },
        ],
        default: [],
        niche: true,
      },
      {
        // Distinct from adhering to the Resolution Stay Protocol above (a
        // yes/no fact): this is how far the *substantive* contractual stay on
        // the non-defaulting party's own close-out rights actually extends.
        key: "resolutionStayRecognition",
        label: "Resolution Stay / Bail-in Recognition Scope",
        type: "select",
        options: [
          { value: "fullContractualStay", label: "Full contractual stay of termination/close-out rights on counterparty resolution (BRRD Art. 55-style / US QFC Stay Rules)", favors: "dealer" },
          { value: "regulatoryMinimumOnly", label: "Stay language narrowly scoped to the regulatory minimum actually compelled", favors: "buyside" },
          { value: "notApplicable", label: "Not applicable — neither party is in-scope for mandatory stay recognition", favors: "neutral" },
        ],
        default: "regulatoryMinimumOnly",
        niche: true,
      },
      {
        key: "confirmationMethod",
        label: "Confirmation Method (9(e))",
        type: "select",
        options: [
          { value: "electronicPlatform", label: "Electronic confirmation platform (e.g., MarkitWire, electronic messaging)", favors: "neutral" },
          { value: "paper", label: "Paper / manual confirmation", favors: "neutral" },
        ],
        default: "electronicPlatform",
        niche: true,
      },
      {
        key: "portfolioCompression",
        label: "Portfolio Compression / Multilateral Netting Participation",
        type: "select",
        options: [
          { value: "consentRequired", label: "Consent required from both parties before either submits Transactions to compression/netting cycles", favors: "buyside" },
          { value: "automaticParticipation", label: "Either party may submit Transactions to industry compression cycles without separate consent (subject to standard protocol terms)", favors: "neutral" },
          { value: "dealerDiscretion", label: "Dealer may unilaterally compress/tear up eligible Transactions at its discretion", favors: "dealer" },
        ],
        default: "automaticParticipation",
        niche: true,
      },
      {
        key: "noticeMethodCloseout",
        label: "Notice Method for Close-out Communications (Section 12)",
        type: "select",
        options: [
          { value: "emailValidForAll", label: "Email is an effective method for all notices, including Section 5/6 default and close-out notices", favors: "neutral" },
          { value: "emailExcludedForCloseout", label: "Email excluded for Section 5/6 close-out notices — only fax, hand delivery, or telex is effective (strict 1992-style reading)", favors: "dealer" },
        ],
        default: "emailValidForAll",
        niche: true,
      },
      {
        key: "escrowNonSimultaneous",
        label: "Escrow for Non-Simultaneous Settlement",
        type: "select",
        options: [
          { value: "available", label: "Escrow agent mechanism available for cross-timezone/non-simultaneous settlement Transactions", favors: "neutral" },
          { value: "notAvailable", label: "No escrow mechanism — settlement risk borne per Transaction terms", favors: "neutral" },
        ],
        default: "notAvailable",
        niche: true,
      },
    ],
  },

  inserts: {
    label: "Inserts (Bespoke)",
    fields: [
      {
        key: "sanctionsAML",
        label: "Sanctions / AML Provisions",
        type: "select",
        options: [
          { value: "none", label: "No bespoke sanctions rep", favors: "neutral" },
          { value: "standard", label: "Standard sanctions representation", favors: "neutral" },
          { value: "enhanced", label: "Enhanced rep + ongoing certification + termination right", favors: "dealer" },
        ],
        default: "standard",
        niche: true,
      },
      {
        key: "setoff",
        label: "Set-Off",
        type: "select",
        options: [
          { value: "none", label: "No contractual set-off (ISDA default silent)", favors: "buyside" },
          { value: "narrow", label: "Narrow — matured, same currency & entity", favors: "neutral" },
          { value: "broadWithClientAssetCarveout", label: "Broad — cross-affiliate, unmatured, cross-currency — but carved out for statutory client-segregated / underlying fund investor assets", favors: "dealer" },
          { value: "broad", label: "Broad — cross-affiliate, unmatured, cross-currency, no carve-out", favors: "dealer", aggressive: true },
        ],
        default: "narrow",
        niche: true,
      },
      {
        key: "illegalityFM",
        label: "Illegality / Force Majeure Waiting Period",
        type: "select",
        options: [
          { value: "0", label: "0 business days (immediate)", favors: "dealer", aggressive: true },
          { value: "3", label: "3 business days (ISDA 2002 default)", favors: "neutral" },
          { value: "8", label: "8 business days (extended)", favors: "buyside" },
        ],
        default: "3",
        niche: true,
      },
      {
        key: "illegalityDesignationRight",
        label: "Illegality / FM — Who Designates the Early Termination Date",
        type: "select",
        options: [
          { value: "eitherAffectedPartyDesignates", label: "Either Affected Party may designate, selecting which Affected Transactions to terminate (ISDA default)", favors: "neutral" },
          { value: "nonAffectedPartyControls", label: "The Non-Affected Party controls designation of the Early Termination Date", favors: "dealer" },
        ],
        default: "eitherAffectedPartyDesignates",
        niche: true,
      },
      {
        key: "regulatoryOverlay",
        label: "Cross-Border Regulatory Overlay",
        type: "select",
        options: [
          { value: "none", label: "None / not applicable", favors: "neutral" },
          { value: "indiaOnshore", label: "India — Onshore (FEMA / RBI-regulated entity)", favors: "neutral" },
          { value: "giftCity", label: "India — GIFT City IFSC (IFSCA-regulated, English/NY law typically retained)", favors: "neutral" },
          { value: "emirEU", label: "EU — EMIR-scoped counterparty", favors: "neutral" },
          { value: "doddFrank", label: "US — Dodd-Frank / CFTC-scoped counterparty", favors: "neutral" },
        ],
        default: "none",
        niche: true,
      },
      {
        key: "femaCollateralApproval",
        label: "FEMA / RBI Cross-Border Collateral Approval (India)",
        type: "select",
        conditionalOn: { key: "regulatoryOverlay", value: "indiaOnshore" },
        options: [
          { value: "notApplicable", label: "Not applicable / no offshore collateral posting", favors: "neutral" },
          { value: "generalPermission", label: "General permission relied upon (RBI Master Direction – Margin for Derivative Contracts)", favors: "neutral" },
          { value: "specificApproval", label: "Specific RBI approval obtained for offshore collateral posting", favors: "neutral" },
          { value: "pending", label: "Approval pending / not yet obtained", favors: "neutral" },
        ],
        default: "notApplicable",
        niche: true,
      },
      {
        // A mutual clause restricts both parties equally, so at first glance
        // omitting it should be neutral. It isn't: the Dealer is already bound
        // by independent regulatory confidentiality duties (banking secrecy,
        // information-barrier/Chinese-wall rules) regardless of contract, while
        // the Counterparty's NAV, positions, and strategy — disclosed mainly for
        // credit/collateral purposes — have no such backstop. Dropping the clause
        // removes a real constraint from the Counterparty's side and only a
        // redundant one from the Dealer's, so "no clause" nets out dealer-favorable.
        key: "confidentiality",
        label: "Confidentiality",
        type: "select",
        options: [
          { value: "none", label: "No confidentiality provision", favors: "dealer" },
          { value: "mutual", label: "Mutual confidentiality (standard carve-outs for regulators/auditors)", favors: "neutral" },
          { value: "oneWayProtectsCounterparty", label: "One-way — only Counterparty's information is protected", favors: "buyside", aggressive: true },
        ],
        default: "mutual",
        niche: true,
      },
      {
        key: "recordingConsent",
        label: "Recording of Communications Consent",
        type: "select",
        options: [
          { value: "required", label: "Consent to recording of telephone/electronic communications (MiFID II-style)", favors: "dealer" },
          { value: "notRequired", label: "No recording consent provision", favors: "buyside" },
        ],
        default: "required",
        niche: true,
      },
      {
        key: "nonRelianceECP",
        label: "Non-Reliance / ECP Representations",
        type: "select",
        options: [
          { value: "none", label: "No additional non-reliance representations", favors: "buyside" },
          { value: "standard", label: "Standard non-reliance + Eligible Contract Participant (ECP) representations", favors: "dealer" },
        ],
        default: "standard",
        niche: true,
      },
      {
        // Distinct from Non-Reliance/ECP above: No Agency (2002 §3(g)) confirms
        // each party is acting as principal, not as agent for an undisclosed
        // third party — a separate representation an agency/investment-manager
        // structure specifically needs qualified.
        key: "noAgencyRepresentation",
        label: "No Agency Representation (2002 form, Section 3(g))",
        type: "select",
        options: [
          { value: "includedStandard", label: "Included as standard, unmodified 2002-form representation", favors: "neutral" },
          { value: "carvedOutForAgencyStructures", label: "Carved out / modified to permit an investment manager or agent structure trading on behalf of underlying principals", favors: "buyside" },
        ],
        default: "includedStandard",
        niche: true,
      },
      {
        key: "fishOrCutBait",
        label: "Fish-or-Cut-Bait Clause (Timely Election Requirement)",
        type: "select",
        options: [
          { value: "none", label: "No time limit — Non-defaulting Party may designate an Early Termination Date at any time (ISDA default, unlimited optionality)", favors: "dealer" },
          { value: "reasonable", label: "Must designate within a reasonable time (fact-specific, no fixed deadline)", favors: "neutral" },
          { value: "fixedWindow", label: "Must designate within a fixed window (e.g., 20 business days) of first becoming aware of the Event of Default, or the right lapses for that event", favors: "buyside" },
        ],
        default: "none",
        niche: true,
      },
      {
        key: "mostFavoredNation",
        label: "Most Favored Nation (MFN) Clause",
        type: "select",
        options: [
          { value: "none", label: "No MFN clause", favors: "dealer" },
          { value: "pricingOnly", label: "MFN on pricing/spread terms only, versus the Dealer's other similarly-situated counterparties", favors: "neutral" },
          { value: "broad", label: "Broad MFN across pricing, credit, and collateral terms", favors: "buyside", aggressive: true },
        ],
        default: "none",
        niche: true,
      },
    ],
  },
};

const CATEGORY_ORDER = ["frame", "core", "attachments", "edge", "inserts"];

// Fields that only exist under one specific CSA form (conditionalOn
// csaStructure). When two configs use DIFFERENT CSA forms, these aren't
// comparable at all — a Pledge-only election like "custodianArrangement"
// has no counterpart concept in an IM Bilateral CSA, so diffing their raw
// (often just-left-at-default) values produces either a misleading "no
// difference" or, worse, a scored "match" on an election that doesn't
// actually exist in the real document. Comparison logic should exclude
// these entirely when csaStructure itself differs, and let the
// "CSA / Collateral Structure" field's own (always-shown) diff carry that
// signal instead. See generateDiff() and generateFullDiff().
const CSA_STRUCTURE_SPECIFIC_KEYS = [
  "demandMechanic",
  "distributionsElection",
  "custodianArrangement",
  "rehypothecationRights",
  "substitutionConsent",
  "imCalculationMethod",
  "segregationStructure",
  "custodianApproval",
];

function csaStructuresDiffer(configA, configB) {
  return configA.attachments.csaStructure !== configB.attachments.csaStructure;
}

// field.conditionalOn.value may be a single value or an array of values the
// dependency must match for the field to be shown/included. For a dependency
// whose value isn't a plain scalar (e.g. a dualSelect's {a, b}), supply
// conditionalOn.test(depValue) instead of value.
function conditionalMatch(field, config, cat) {
  if (!field.conditionalOn) return true;
  const dep = config[cat][field.conditionalOn.key];
  if (field.conditionalOn.test) return field.conditionalOn.test(dep);
  const target = field.conditionalOn.value;
  return Array.isArray(target) ? target.includes(dep) : dep === target;
}

// A field is visible if its conditionalOn dependency (if any) is satisfied,
// it isn't a niche field hidden by Vanilla mode, and it isn't excluded by the
// user's custom Focus filter (STATE.focusFields). Hidden fields all keep
// their PIECES default in config/scoring — they just aren't editable or
// shown in outputs until the filter hiding them is relaxed.
function fieldVisible(field, config, cat) {
  if (!conditionalMatch(field, config, cat)) return false;
  if (field.niche && STATE.vanillaMode) return false;
  if (cat === "attachments" && STATE.vanillaMode && STATE.vanillaScope === "isdaOnly") return false;
  if (STATE.focusFields && !STATE.focusFields.includes(field.key)) return false;
  return true;
}

/* ---------------------------------------------------------------------- */
/* 1b. ISDA REFERENCE MAP — section pointers shown on hover/focus/edit,   */
/*     keyed by field.key. Indicative to the ISDA 2002 Master Agreement   */
/*     form; not a substitute for reading the executed documents.         */
/* ---------------------------------------------------------------------- */

const ISDA_REFERENCES = {
  governingLaw: {
    doc: "ISDA Master Agreement",
    section: "Section 13(a) (Governing Law) — elected in Schedule Part 4(h)",
    short: "§13(a)",
    description: "Section 13(a) carries the boilerplate governing-law/jurisdiction clause; the parties pick which law actually applies in Part 4(h) of the Schedule.",
  },
  multibranch: {
    doc: "ISDA Master Agreement",
    section: "Section 10 (Offices; Multibranch Parties) — elected in Schedule Part 4(c)",
    short: "§10",
    description: "Section 10 governs which Office a party may transact through. Multibranch Party status is switched on or off per party in Part 4(c) of the Schedule.",
  },
  paymentNetting: {
    doc: "ISDA Master Agreement",
    section: "Section 2(c) (Netting of Payments) — election in Schedule Part 4(a)",
    short: "§2(c)",
    description: "Section 2(c) nets payment obligations due on the same date in the same currency. Extending netting across all Transactions is elected in Part 4(a) of the Schedule.",
  },
  crossDefaultThreshold: {
    doc: "ISDA Master Agreement",
    section: "Section 5(a)(vi) (Cross Default) — Threshold Amount in Schedule Part 1(c)",
    short: "§5(a)(vi)",
    description: "Section 5(a)(vi) is the Cross Default Event of Default. The Threshold Amount that must be exceeded before it fires is set separately for each party in Part 1(c) of the Schedule.",
  },
  crossDefaultType: {
    doc: "ISDA Master Agreement",
    section: "Section 5(a)(vi) (Cross Default) — trigger scope drafted in Schedule Part 1(c)",
    short: "§5(a)(vi)",
    description: "Whether the trigger is a payment default only, or also captures anticipatory acceleration, is drafted directly into the Cross Default definition in Part 1(c) of the Schedule.",
  },
  specifiedIndebtednessScope: {
    doc: "ISDA Master Agreement",
    section: "'Specified Indebtedness' (Section 14), used in Section 5(a)(vi) — amended in Schedule Part 1(c)",
    short: "§14",
    description: "Specified Indebtedness feeds the Cross Default definition. Schedules commonly carve out ordinary-course bank deposits, and fund-facing Schedules often further carve out repo/securities-lending/margin financing used as portfolio financing — both amendments are drafted directly into the Section 14 definition via Part 1(c).",
  },
  specifiedEntities: {
    doc: "ISDA Master Agreement",
    section: "'Specified Entity' (Section 14), used in Sections 5(a)(iii),(v),(vi),(vii) — elected in Schedule Part 1(a)",
    short: "§5(a) / §14",
    description: "Specified Entity is a defined term feeding several Events of Default (Credit Support Default, Default Under Specified Transaction, Cross Default, Bankruptcy). The covered affiliates are listed per party in Part 1(a) of the Schedule.",
  },
  ates: {
    doc: "ISDA Master Agreement",
    section: "Section 5(b)(v) (Additional Termination Event) — drafted in Schedule Part 1(h)",
    short: "§5(b)(v)",
    description: "The printed form's Section 5(b)(v) is a placeholder — it only operates if the parties draft specific triggers (NAV decline, key person, downgrade, etc.) into Part 1(h) of the Schedule.",
  },
  aet: {
    doc: "ISDA Master Agreement",
    section: "Section 6(a) (Right to Terminate Following Event of Default) — AET election in Schedule Part 1(f)",
    short: "§6(a)",
    description: "Section 6(a) governs how Early Termination is designated after a default. The Automatic Early Termination proviso (termination happening automatically rather than by notice) is switched on or off per party in Part 1(f) of the Schedule.",
  },
  processAgent: {
    doc: "ISDA Master Agreement",
    section: "Section 13(c) (Process Agent) — named in Schedule Part 4(b)",
    short: "§13(c)",
    description: "Section 13(c) requires a Process Agent for service of process where one is needed; the actual agent is named per party in Part 4(b) of the Schedule.",
  },
  csaStructure: {
    doc: "Credit Support Annex / Deed",
    section: "Separate CSA document, referenced in Schedule Part 4(g)",
    short: "CSA",
    description: "Collateral structure sits outside the Master Agreement itself — it's a separate Credit Support Annex (Title Transfer, English law) or Credit Support Deed/Pledge Annex (New York law), referenced in Part 4(g) of the Schedule.",
  },
  independentAmount: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 (Elections and Variables) — 'Independent Amount'",
    short: "CSA ¶13",
    description: "Independent Amount is an elected variable in Paragraph 13 of the CSA — extra collateral posted regardless of current exposure, on top of the Threshold/MTA mechanics.",
  },
  threshold: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 (Elections and Variables) — 'Threshold'",
    short: "CSA ¶13",
    description: "Threshold is the uncollateralized exposure a party may carry before it must post collateral, elected per party in Paragraph 13 of the CSA.",
  },
  mta: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 (Elections and Variables) — 'Minimum Transfer Amount'",
    short: "CSA ¶13",
    description: "Minimum Transfer Amount sets the smallest collateral transfer that will actually be made, to avoid nuisance transfers; elected per party in Paragraph 13 of the CSA.",
  },
  eligibleCollateral: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 — 'Eligible Collateral', substitutions under Paragraph 11(b)",
    short: "CSA ¶13",
    description: "The basket of asset types a party may post as collateral is defined in Paragraph 13 of the CSA, with substitution rights under Paragraph 11(b).",
  },
  haircutLevel: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 — 'Valuation Percentage'",
    short: "CSA ¶13",
    description: "Haircuts are drafted as the Valuation Percentage applied to each eligible collateral type in Paragraph 13 of the CSA.",
  },
  concentrationLimits: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 — 'Eligible Collateral' concentration caps",
    short: "CSA ¶13",
    description: "Caps limiting how much of the posted collateral pool may come from a single issuer or asset class are drafted into Paragraph 13 alongside the Eligible Collateral and haircut elections.",
  },
  interestRateCashCollateral: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 — 'Distributions and Interest Amount', Interest Rate",
    short: "CSA ¶13",
    description: "The rate paid on posted cash collateral is elected in Paragraph 13's Interest Rate election, commonly a relevant risk-free rate flat or minus a negotiated spread.",
  },
  valuationAgent: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 13 — 'Valuation Agent'",
    short: "CSA ¶13",
    description: "The party responsible for calculating Exposure and Credit Support Amount each Valuation Date is elected in Paragraph 13; a sole dealer Valuation Agent is common but frequently paired with a dispute mechanism.",
  },
  disputeResolutionTiming: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 5 (Dispute Resolution)",
    short: "CSA ¶5",
    description: "Paragraph 5 of the CSA governs the recalculation and resolution timetable when a party disputes a Valuation Agent's Exposure or Value calculation.",
  },
  demandMechanic: {
    doc: "Credit Support Annex (Title Transfer, English law)",
    section: "CSA Paragraph 3 (Transfers) — demand mechanic",
    short: "CSA ¶3",
    description: "Under the Title Transfer form, a transfer of collateral is only required following a demand by the Transferee after each Valuation Date, unless the parties elect an automatic mechanic.",
  },
  distributionsElection: {
    doc: "Credit Support Annex (Title Transfer, English law)",
    section: "CSA Paragraph 6 (Distributions) / Paragraph 13 election",
    short: "CSA ¶6",
    description: "Whether coupons/dividends on transferred securities are passed back to the Transferor as Distributions, or retained by the Transferee, is elected in Paragraph 13.",
  },
  custodianArrangement: {
    doc: "Credit Support Annex (Pledge/Security, New York law)",
    section: "CSA Paragraph 13 — 'Eligible Custodian' election",
    short: "CSA ¶13",
    description: "Pledge-structure CSAs may require pledged collateral to be held by a third-party or tri-party custodian meeting agreed 'Eligible Custodian' criteria, elected in Paragraph 13.",
  },
  rehypothecationRights: {
    doc: "Credit Support Annex (Pledge/Security, New York law)",
    section: "CSA Paragraph 6(c) (Use of Posted Collateral)",
    short: "CSA ¶6(c)",
    description: "Paragraph 6(c) governs the Secured Party's right to sell, pledge, rehypothecate, or otherwise use posted collateral — a heavily negotiated pledge-form-specific term.",
  },
  substitutionConsent: {
    doc: "Credit Support Annex",
    section: "CSA Paragraph 4(d) (Substitutions)",
    short: "CSA ¶4(d)",
    description: "Paragraph 4(d) governs a pledgor's right to substitute posted collateral for other Eligible Collateral, including whether Secured Party consent is required.",
  },
  imCalculationMethod: {
    doc: "ISDA 2016 IM Credit Support Annex / Security Agreement",
    section: "IM CSA Paragraph 13 — 'Method of Calculation'",
    short: "IM CSA ¶13",
    description: "Bilateral Initial Margin is calculated either under ISDA SIMM (model-based, requires ongoing backtesting/governance) or a Standardized/Regulatory Schedule (grid-based), elected in the IM CSA.",
  },
  segregationStructure: {
    doc: "ISDA 2016 IM Credit Support Annex / Security Agreement",
    section: "IM CSA — segregation and custodian arrangements",
    short: "IM CSA",
    description: "UMR-mandated Initial Margin must sit in a segregated, non-rehypothecatable account with a third-party or tri-party custodian; the two are administered differently and elected in the IM CSA/Security Agreement.",
  },
  custodianApproval: {
    doc: "ISDA 2016 IM Credit Support Annex / Security Agreement",
    section: "IM CSA — custodian approval rights",
    short: "IM CSA",
    description: "Selection and replacement of the IM segregation custodian is either subject to mutual consent of both parties or the Secured Party's discretion from a pre-approved list.",
  },
  taxReps: {
    doc: "ISDA Master Agreement",
    section: "Section 3(e)/(f) (Payee/Payer Tax Representations) — tailored in Schedule Part 2",
    short: "§3(e)/(f)",
    description: "Tax representations (including FATCA and local withholding status) are made under Section 3(e) and (f), with the specific representations tailored in Part 2 of the Schedule.",
  },
  grossUp: {
    doc: "ISDA Master Agreement",
    section: "Section 2(d) (Deduction or Withholding for Tax)",
    short: "§2(d)",
    description: "Section 2(d) governs gross-up for withholding tax on Indemnifiable Tax, conditioned on each party's own tax representations remaining accurate.",
  },
  documentsDelivered: {
    doc: "ISDA Master Agreement",
    section: "Section 4(a) (Furnish Specified Information) — listed in Schedule Part 3",
    short: "§4(a)",
    description: "Section 4(a) requires each party to deliver the documents specified as a condition precedent; the actual list (tax forms, authorizations, opinions, etc.) is enumerated in Part 3 of the Schedule.",
  },
  calcAgent: {
    doc: "ISDA Master Agreement",
    section: "'Calculation Agent' (Section 14) — appointed in Schedule Part 4(d)",
    short: "§14",
    description: "Calculation Agent is a Section 14 defined term responsible for valuations and close-out calculations; who holds the role is appointed in Part 4(d) of the Schedule.",
  },
  sanctionsAML: {
    doc: "Schedule / bespoke",
    section: "Not a printed-form section — typically Schedule Part 5 (Other Provisions)",
    short: "Part 5",
    description: "Sanctions and AML representations aren't in the printed ISDA form; they're bespoke language almost always inserted into Part 5 (Other Provisions) of the Schedule.",
  },
  setoff: {
    doc: "ISDA Master Agreement",
    section: "Section 6(f) (Set-Off, 2002 form only) — otherwise Schedule Part 5 for the 1992 form",
    short: "§6(f)",
    description: "The 2002 Master Agreement has an optional Set-Off section (6(f)) that must be affirmatively elected. The 1992 form has no equivalent section, so set-off is instead drafted into Part 5 (Other Provisions).",
  },
  illegalityFM: {
    doc: "ISDA Master Agreement",
    section: "Section 5(b)(i) Illegality / 5(b)(ii) Force Majeure Event (2002 form only) — Waiting Period in Section 14",
    short: "§5(b)(i)/(ii)",
    description: "Illegality is a Termination Event under 5(b)(i) in both forms; Force Majeure Event under 5(b)(ii) exists only in the 2002 form. Both run on a Waiting Period defined in Section 14, which the parties may shorten or extend.",
  },
  illegalityDesignationRight: {
    doc: "ISDA Master Agreement",
    section: "Section 6(b)/(d) (Right to Terminate Following Termination Event) — designation right, distinct from the Waiting Period itself",
    short: "§6(b)/(d)",
    description: "Once the Waiting Period expires, the printed form lets either Affected Party designate the Early Termination Date and choose which Affected Transactions to terminate. Handing that control solely to the Non-Affected Party is a bespoke Schedule amendment.",
  },
  regulatoryOverlay: {
    doc: "Schedule / bespoke",
    section: "Not ISDA-defined — addressed via Schedule Part 5 or a side letter",
    short: "Part 5",
    description: "Cross-border regulatory overlays (FEMA/RBI, EMIR, Dodd-Frank) sit outside the printed ISDA form; they're typically addressed through bespoke Part 5 language or a separate regulatory side letter/protocol adherence.",
  },
  femaCollateralApproval: {
    doc: "Schedule / bespoke",
    section: "Not ISDA-defined — addressed via Schedule Part 5 or a side letter",
    short: "Part 5",
    description: "FEMA/RBI collateral-approval status is a local-law compliance matter, not a printed ISDA term; it's typically tracked via Part 5 of the Schedule or a compliance side letter rather than the Master Agreement itself.",
  },
  disputeResolution: {
    doc: "ISDA Master Agreement",
    section: "Section 13(b) (Jurisdiction) — elected alongside governing law in the Schedule",
    short: "§13(b)",
    description: "Section 13(b) is the submission-to-jurisdiction clause (or is disapplied in favor of arbitration language). Courts vs. arbitration, and exclusivity, are elected in the Schedule alongside the governing-law election.",
  },
  transferAssignment: {
    doc: "ISDA Master Agreement",
    section: "Section 7 (Transfer) — restrictions/carve-outs added in Schedule Part 5",
    short: "§7",
    description: "Section 7 prohibits transfer of the Agreement without the other party's consent, subject to narrow statutory exceptions (e.g., merger of the whole business). Broader consent-free transfer rights, or a tightening to remove even those exceptions, are added in Schedule Part 5.",
  },
  sovereignImmunityWaiver: {
    doc: "ISDA Master Agreement / Schedule",
    section: "Schedule Part 5 (Other Provisions) — waiver of immunities, paired with the jurisdiction election in 13(b)",
    short: "Part 5",
    description: "Where a party may be entitled to sovereign or state immunity, a waiver of jury trial and of immunity from suit/execution is added in Part 5 of the Schedule — without it, a jurisdiction/arbitration election in 13(b) may be unenforceable against that party's assets.",
  },
  bankruptcyCarveout: {
    doc: "ISDA Master Agreement",
    section: "Section 5(a)(vii) (Bankruptcy) — grace periods/carve-outs amended in Schedule Part 5",
    short: "§5(a)(vii)",
    description: "Section 5(a)(vii) lists insolvency-related events (petition, execution/attachment, appointment of a receiver, etc.), several with a built-in 15/30-day grace period. Schedules commonly shorten those periods, or carve out regulated-entity resolution regimes and technical/non-payment insolvency events, in Part 5.",
  },
  taxEventUponMerger: {
    doc: "ISDA Master Agreement",
    section: "Section 5(b) (Termination Events) — Tax Event Upon Merger, numbered 5(b)(iii) in the 1992 form / 5(b)(iv) in the 2002 form",
    short: "§5(b)",
    description: "Tax Event Upon Merger is a Termination Event triggered when a party becomes obligated to pay additional withholding tax as a result of a merger involving itself or a Credit Support Provider. It's a standard printed-form Termination Event unless expressly excluded in the Schedule.",
  },
  creditEventUponMerger: {
    doc: "ISDA Master Agreement",
    section: "Section 5(b)(iv) (Credit Event Upon Merger) — elected in Schedule Part 1(d)",
    short: "§5(b)(iv)",
    description: "Credit Event Upon Merger is a Termination Event triggered by a party's creditworthiness materially weakening after a merger or consolidation (the 'Designated Event' test). It must be affirmatively elected, for one or both parties, in Part 1(d) of the Schedule.",
  },
  terminationCurrency: {
    doc: "ISDA Master Agreement",
    section: "Section 6(e) (Payments on Early Termination) — Termination Currency elected in the Schedule",
    short: "§6(e)",
    description: "Termination Currency is the currency close-out amounts are converted into and settled in; it's elected in the Schedule, defaulting to the currency of the greater exposure if left unelected.",
  },
  closeoutMethodology: {
    doc: "ISDA Master Agreement",
    section: "Section 6(e) (Payments on Early Termination)",
    short: "§6(e)",
    description: "Section 6(e) sets the close-out valuation method. The 2002 form uses a single 'Close-out Amount' standard; the 1992 form instead requires an election between Market Quotation (third-party dealer polls) and Loss (a party's own reasonable determination).",
  },
  creditSupportProvider: {
    doc: "ISDA Master Agreement / Schedule",
    section: "Schedule Part 4(g) — Credit Support Provider election, referencing the Credit Support Document",
    short: "Part 4(g)",
    description: "A Credit Support Provider (typically a parent guaranteeing a subsidiary's obligations) is named per party in Part 4(g) of the Schedule, with the guarantee itself executed as a separate Credit Support Document.",
  },
  failureToPayGracePeriod: {
    doc: "ISDA Master Agreement",
    section: "Section 5(a)(i) (Failure to Pay or Deliver) — amended in Schedule Part 5",
    short: "§5(a)(i)",
    description: "The printed form treats any late payment/delivery (after the 1/3 Local Business Day grace period) as an Event of Default. A bespoke carve-out for failures caused solely by operational, administrative, or technical error — curable within a stated window after notice — is added in Part 5 of the Schedule.",
  },
  defaultInterestSpread: {
    doc: "ISDA Master Agreement",
    section: "Section 9(h) (Default Interest; Other Amounts) — Default Rate defined in Section 14",
    short: "§9(h)",
    description: "Section 9(h) charges interest on overdue amounts at the Default Rate, a Section 14 defined term built from a base rate plus a spread. Whether that spread is symmetric or set punitively higher for a defaulting party is a drafting choice.",
  },
  protocolAdherence: {
    doc: "ISDA Protocols",
    section: "Adhered to via the ISDA website — not part of the printed Master Agreement itself",
    short: "Protocol",
    description: "Market-wide protocols (VM, IBOR Fallbacks, Resolution Stay, etc.) amend the Master Agreement by reference when both parties separately adhere via ISDA's protocol platform, rather than through bilateral Schedule drafting.",
  },
  resolutionStayRecognition: {
    doc: "ISDA Master Agreement / Protocol",
    section: "Schedule Part 5, typically implemented via the ISDA Resolution Stay Jurisdictional Modular Protocol / 2015 Universal Resolution Stay Protocol",
    short: "Part 5",
    description: "Bail-in/resolution stay recognition contractually agrees that a party's own close-out and termination rights are stayed if its counterparty enters a bank resolution or insolvency proceeding (BRRD Art. 55 / US QFC Stay Rules). It's distinct from merely adhering to the stay protocol — this is the substantive scope of what's actually stayed.",
  },
  confirmationMethod: {
    doc: "ISDA Master Agreement",
    section: "Section 9(e) (Confirmations)",
    short: "§9(e)",
    description: "Section 9(e) governs how Confirmations are exchanged and evidence a Transaction. Electronic confirmation platforms are now standard for high-volume relationships; paper confirmation still turns up for bespoke or infrequent trades.",
  },
  noticeMethodCloseout: {
    doc: "ISDA Master Agreement",
    section: "Section 12 (Notices) — effective methods, and any restriction on their use for Section 5/6 notices",
    short: "§12",
    description: "Section 12 lists the methods (hand delivery, telex, facsimile, electronic messaging) by which a notice is effective, and when. Whether email counts as an effective 'electronic messaging system' for a default/close-out notice specifically has been real litigated ground and is often clarified in the Schedule.",
  },
  escrowNonSimultaneous: {
    doc: "Schedule / bespoke",
    section: "Not a printed-form section — typically Schedule Part 5 (Other Provisions)",
    short: "Part 5",
    description: "For Transactions that settle across time zones without true payment-versus-payment simultaneity, an escrow mechanism can mitigate Herstatt-style settlement risk. It has no printed-form basis and is added, where used, in Part 5 of the Schedule.",
  },
  confidentiality: {
    doc: "Schedule / bespoke",
    section: "Not a printed-form section — typically Schedule Part 5 (Other Provisions)",
    short: "Part 5",
    description: "The printed ISDA form has no confidentiality clause; any confidentiality obligation (mutual or one-way) is bespoke language added to Part 5 of the Schedule.",
  },
  recordingConsent: {
    doc: "Schedule / bespoke",
    section: "Not a printed-form section — typically Schedule Part 5 (Other Provisions)",
    short: "Part 5",
    description: "Consent to recording of calls and electronic communications isn't in the printed form; it's a bespoke insertion, now common for MiFID II / Dodd-Frank recordkeeping compliance.",
  },
  nonRelianceECP: {
    doc: "ISDA Master Agreement",
    section: "Section 3 representations, supplemented in Schedule Part 2 / Part 5",
    short: "§3 / Part 5",
    description: "Non-reliance representations (each party is acting on its own judgment) and Eligible Contract Participant status build on the Section 3 representations, typically added or elaborated in Part 2 or Part 5 of the Schedule.",
  },
  noAgencyRepresentation: {
    doc: "ISDA Master Agreement",
    section: "Section 3(g) (No Agency, 2002 form only) — qualified in Schedule Part 2",
    short: "§3(g)",
    description: "Section 3(g), added in the 2002 form, has each party represent it is entering into the Agreement and each Transaction as principal, not as agent for any other party. An investment manager trading on behalf of underlying funds/accounts needs this qualified, typically in Part 2 of the Schedule.",
  },
  fishOrCutBait: {
    doc: "Schedule / bespoke",
    section: "Not a printed-form section — bespoke overlay on Section 6(a)/(d), typically drafted in Schedule Part 5",
    short: "Part 5",
    description: "Colloquially a 'fish-or-cut-bait' clause: it forces the Non-defaulting Party to designate (or decline to designate) an Early Termination Date within a stated window after an Event of Default, rather than sitting on that option indefinitely. The printed form imposes no such deadline, so this is added via Part 5 of the Schedule.",
  },
  mostFavoredNation: {
    doc: "Schedule / bespoke",
    section: "Not a printed-form section — a bespoke Schedule Part 5 or side-letter provision",
    short: "Part 5",
    description: "An MFN clause contractually entitles the Counterparty to the best comparable terms the Dealer extends to similarly-situated counterparties. It has no ISDA printed-form basis and is rare outside financing/prime-brokerage-adjacent relationships — typically drafted in Part 5 or a separate side letter.",
  },
  portfolioCompression: {
    doc: "Schedule / bespoke, often via ISDA protocol",
    section: "Not a printed-form section — addressed in Part 5 or by adherence to a multilateral compression protocol",
    short: "Part 5",
    description: "Portfolio compression (multilateral tear-up/netting of offsetting Transactions to reduce gross notional) isn't in the printed form; participation terms are set in Schedule Part 5 or by adhering to a standard industry compression protocol/service (e.g., TriOptima).",
  },
};

/* ---------------------------------------------------------------------- */
/* 2. PRESETS — 8 common counterparty pairs / commercial situations       */
/* ---------------------------------------------------------------------- */

const PRESETS = [
  {
    id: "blank",
    name: "— Blank configuration —",
    description: "",
    config: null,
  },
  {
    id: "hedgeFund",
    name: "1. Dealer vs. Large Hedge Fund (sophisticated, leveraged)",
    description:
      "Highly negotiated bilateral relationship. Fund resists ATEs and broad specified entities; dealer pushes NAV/downgrade triggers and IM given leverage profile.",
    config: {
      frame: { governingLaw: "NY", multibranch: "yes", paymentNetting: "all" },
      core: {
        crossDefaultThreshold: { a: 50000000, b: 10000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        crossDefaultType: "defaultOrAcceleration",
        specifiedEntities: "allAffiliates",
        ates: ["navDecline", "keyPerson"],
        aet: { a: "no", b: "yes" },
        processAgent: "CT Corporation System, New York, NY",
        creditEventUponMerger: "counterpartyOnly",
        closeoutMethodology: "closeOutAmount2002",
      },
      attachments: {
        csaStructure: "vmImBilateral",
        independentAmount: { a: 0, b: 5000000 },
        threshold: { a: 10000000, b: 0, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        mta: { a: 250000, b: 100000 },
        eligibleCollateral: ["cashUSD", "usTreasuries"],
        haircutLevel: "standard",
      },
      edge: {
        taxReps: ["fatca"],
        grossUp: "no",
        documentsDelivered: ["taxForms", "boardRes", "csDocs"],
        calcAgent: "dealerSole",
        defaultInterestSpread: "asymmetricCostOfFunds",
        protocolAdherence: ["vm2016", "iborFallbacks"],
      },
      inserts: { sanctionsAML: "standard", setoff: "broad", illegalityFM: "3", regulatoryOverlay: "none", femaCollateralApproval: "notApplicable" },
    },
  },
  {
    id: "regionalBank",
    name: "2. Dealer vs. Regional / Community Bank",
    description:
      "Investment-grade bank counterparty, prudentially regulated. Symmetric terms are typical; AET usually disapplied given bank resolution regimes. Threshold is rating-linked here to illustrate the feature.",
    config: {
      frame: { governingLaw: "NY", multibranch: "no", paymentNetting: "sameCurrency" },
      core: {
        crossDefaultThreshold: { a: 50000000, b: 50000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        crossDefaultType: "defaultOnly",
        specifiedEntities: "namedSubs",
        ates: [],
        aet: { a: "no", b: "no" },
        processAgent: "",
      },
      attachments: {
        csaStructure: "vmPledgeNY",
        independentAmount: { a: 0, b: 0 },
        threshold: { a: 15000000, b: 15000000, ratingLinked: true, dealerRating: "aa", counterpartyRating: "a" },
        mta: { a: 500000, b: 500000 },
        eligibleCollateral: ["cashUSD", "usTreasuries"],
        haircutLevel: "standard",
      },
      edge: {
        taxReps: ["fatca"],
        grossUp: "no",
        documentsDelivered: ["taxForms", "boardRes"],
        calcAgent: "joint",
      },
      inserts: { sanctionsAML: "standard", setoff: "narrow", illegalityFM: "3", regulatoryOverlay: "none", femaCollateralApproval: "notApplicable" },
    },
  },
  {
    id: "corporate",
    name: "3. Dealer vs. Corporate End-User (hedging only)",
    description:
      "Commercial hedger with no trading appetite. Wants narrow triggers, no ATEs, gross-up protection, and minimal collateral posting.",
    config: {
      frame: { governingLaw: "NY", multibranch: "yes", paymentNetting: "sameCurrency" },
      core: {
        crossDefaultThreshold: { a: 50000000, b: 15000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        crossDefaultType: "defaultOnly",
        specifiedEntities: "none",
        ates: [],
        aet: { a: "no", b: "no" },
        processAgent: "",
      },
      attachments: {
        csaStructure: "vmTitleTransferEnglish",
        independentAmount: { a: 0, b: 0 },
        threshold: { a: 20000000, b: 5000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        mta: { a: 250000, b: 250000 },
        eligibleCollateral: ["cashUSD"],
        haircutLevel: "cashOnlyZero",
      },
      edge: {
        taxReps: ["fatca"],
        grossUp: "yes",
        documentsDelivered: ["taxForms", "boardRes"],
        calcAgent: "dealerSole",
      },
      inserts: { sanctionsAML: "none", setoff: "none", illegalityFM: "8", regulatoryOverlay: "none", femaCollateralApproval: "notApplicable" },
    },
  },
  {
    id: "assetManager",
    name: "4. Dealer vs. Real-Money Asset Manager (multi-fund platform)",
    description:
      "Institutional manager trading across multiple funds/vehicles. Wants fund-by-fund credit segregation, resists cross-fund set-off and broad specified entities.",
    config: {
      frame: { governingLaw: "English", multibranch: "yes", paymentNetting: "sameCurrency" },
      core: {
        crossDefaultThreshold: { a: 50000000, b: 20000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        crossDefaultType: "defaultOnly",
        specifiedEntities: "none",
        ates: ["navDecline"],
        aet: { a: "no", b: "yes" },
        processAgent: "",
      },
      attachments: {
        csaStructure: "vmTitleTransferEnglish",
        independentAmount: { a: 0, b: 0 },
        threshold: { a: 10000000, b: 3000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        mta: { a: 250000, b: 250000 },
        eligibleCollateral: ["cashUSD", "cashOther", "usTreasuries"],
        haircutLevel: "standard",
      },
      edge: {
        taxReps: ["fatca", "s871m"],
        grossUp: "no",
        documentsDelivered: ["taxForms", "legalOpinion"],
        calcAgent: "joint",
      },
      inserts: { sanctionsAML: "standard", setoff: "none", illegalityFM: "3", regulatoryOverlay: "none", femaCollateralApproval: "notApplicable" },
    },
  },
  {
    id: "sovereign",
    name: "5. Dealer vs. Sovereign Wealth Fund / Pension (high leverage, buy-side heavy)",
    description:
      "AAA-quality, highly rated counterparty with significant negotiating leverage. Expect one-sided thresholds/CSA in the counterparty's favor and sovereign immunity carve-outs.",
    config: {
      frame: { governingLaw: "English", multibranch: "no", paymentNetting: "sameCurrency", disputeResolution: "arbitrationLCIA" },
      core: {
        crossDefaultThreshold: { a: 25000000, b: 200000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        crossDefaultType: "defaultOnly",
        specifiedEntities: "none",
        ates: [],
        aet: { a: "no", b: "no" },
        processAgent: "",
        terminationCurrency: "EUR",
      },
      attachments: {
        csaStructure: "vmTitleTransferEnglish",
        independentAmount: { a: 0, b: 0 },
        threshold: { a: 5000000, b: 100000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        mta: { a: 500000, b: 1000000 },
        eligibleCollateral: ["cashUSD", "usTreasuries", "nonUSGovt"],
        haircutLevel: "standard",
      },
      edge: {
        taxReps: ["fatca"],
        grossUp: "yes",
        documentsDelivered: ["taxForms", "legalOpinion"],
        calcAgent: "counterpartySole",
        defaultInterestSpread: "symmetricNegotiated",
      },
      inserts: { sanctionsAML: "none", setoff: "none", illegalityFM: "8", regulatoryOverlay: "none", femaCollateralApproval: "notApplicable" },
    },
  },
  {
    id: "indiaNBFC",
    name: "6. Dealer vs. Indian NBFC / Bank (RBI-regulated, onshore)",
    description:
      "RBI-regulated onshore financial counterparty. FEMA governs any offshore collateral posting; the Bilateral Netting of Qualified Financial Contracts Act, 2020 underpins netting enforceability. Ratings typically referenced from CRISIL/ICRA/CARE/India Ratings — threshold is rating-linked here to reflect that practice.",
    config: {
      frame: { governingLaw: "English", multibranch: "no", paymentNetting: "sameCurrency" },
      core: {
        crossDefaultThreshold: { a: 30000000, b: 30000000, ratingLinked: true, dealerRating: "aa", counterpartyRating: "a" },
        crossDefaultType: "defaultOnly",
        specifiedEntities: "namedSubs",
        ates: [],
        aet: { a: "no", b: "no" },
        processAgent: "",
      },
      attachments: {
        csaStructure: "vmTitleTransferEnglish",
        independentAmount: { a: 0, b: 0 },
        threshold: { a: 12000000, b: 12000000, ratingLinked: true, dealerRating: "aa", counterpartyRating: "a" },
        mta: { a: 500000, b: 500000 },
        eligibleCollateral: ["cashUSD", "usTreasuries", "inrGSecs"],
        haircutLevel: "standard",
      },
      edge: {
        taxReps: ["fatca", "s195India"],
        grossUp: "no",
        documentsDelivered: ["taxForms", "boardRes", "legalOpinion"],
        calcAgent: "joint",
        protocolAdherence: ["iborFallbacks", "resolutionStay"],
      },
      inserts: { sanctionsAML: "standard", setoff: "narrow", illegalityFM: "3", regulatoryOverlay: "indiaOnshore", femaCollateralApproval: "generalPermission" },
    },
  },
  {
    id: "indiaCorporate",
    name: "7. Dealer vs. Indian Corporate End-User (FEMA-regulated hedging)",
    description:
      "Resident Indian corporate hedging commercial FX/commodity exposure under RBI's FEMA framework. No trading appetite; resists ATEs and broad collateral posting given restricted offshore-collateral rules for resident entities.",
    config: {
      frame: { governingLaw: "English", multibranch: "yes", paymentNetting: "sameCurrency" },
      core: {
        crossDefaultThreshold: { a: 25000000, b: 8000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        crossDefaultType: "defaultOnly",
        specifiedEntities: "none",
        ates: [],
        aet: { a: "no", b: "no" },
        processAgent: "",
      },
      attachments: {
        csaStructure: "vmTitleTransferEnglish",
        independentAmount: { a: 0, b: 0 },
        threshold: { a: 15000000, b: 3000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        mta: { a: 250000, b: 250000 },
        eligibleCollateral: ["cashUSD"],
        haircutLevel: "cashOnlyZero",
      },
      edge: {
        taxReps: ["fatca", "s195India"],
        grossUp: "yes",
        documentsDelivered: ["taxForms", "boardRes"],
        calcAgent: "dealerSole",
      },
      inserts: { sanctionsAML: "none", setoff: "none", illegalityFM: "8", regulatoryOverlay: "indiaOnshore", femaCollateralApproval: "notApplicable" },
    },
  },
  {
    id: "giftCityFund",
    name: "8. Dealer vs. GIFT City IFSC Fund (offshore-regulated Indian vehicle)",
    description:
      "Fund domiciled in India's GIFT City International Financial Services Centre, regulated by the IFSCA. Typically retains English or NY law and is treated similarly to an offshore fund, with materially lighter FEMA friction than an onshore Indian entity.",
    config: {
      frame: { governingLaw: "English", multibranch: "yes", paymentNetting: "all" },
      core: {
        crossDefaultThreshold: { a: 40000000, b: 15000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        crossDefaultType: "defaultOrAcceleration",
        specifiedEntities: "namedSubs",
        ates: ["navDecline"],
        aet: { a: "no", b: "no" },
        processAgent: "",
      },
      attachments: {
        csaStructure: "vmImBilateral",
        independentAmount: { a: 0, b: 2000000 },
        threshold: { a: 8000000, b: 2000000, ratingLinked: false, dealerRating: "a", counterpartyRating: "a" },
        mta: { a: 250000, b: 150000 },
        eligibleCollateral: ["cashUSD", "usTreasuries"],
        haircutLevel: "standard",
      },
      edge: {
        taxReps: ["fatca"],
        grossUp: "no",
        documentsDelivered: ["taxForms", "boardRes", "csDocs"],
        calcAgent: "dealerSole",
        protocolAdherence: ["vm2016", "iborFallbacks"],
        confirmationMethod: "electronicPlatform",
      },
      inserts: { sanctionsAML: "standard", setoff: "narrow", illegalityFM: "3", regulatoryOverlay: "giftCity", femaCollateralApproval: "notApplicable" },
    },
  },
];

/* ---------------------------------------------------------------------- */
/* 3. STATE                                                               */
/* ---------------------------------------------------------------------- */

function buildDefaultConfig() {
  const cfg = {};
  CATEGORY_ORDER.forEach((cat) => {
    cfg[cat] = {};
    PIECES[cat].fields.forEach((f) => {
      cfg[cat][f.key] = JSON.parse(JSON.stringify(f.default));
    });
  });
  return cfg;
}

// A saved/exported config from before AET became a per-party dualSelect
// stored a single string ("yes"/"no"); carry that old global value over to
// both parties rather than clobbering the new {a, b} shape with a string.
function migrateLegacyAet(coreConfig) {
  if (coreConfig && typeof coreConfig.aet === "string") {
    return { ...coreConfig, aet: { a: coreConfig.aet, b: coreConfig.aet } };
  }
  return coreConfig;
}

// A value from an untrusted import is only accepted for a field if it's at
// least shape-compatible with that field's own type — otherwise the printed-
// form default is kept for that one field. Without this, Object.assign would
// happily spread a malformed category value (e.g. a string or array in place
// of an object) into stray numeric keys, and a malformed dualNumber/dualSelect
// value would flow straight into money()/option lookups and render as "$NaN"
// instead of failing safely. `undefined` (the field simply wasn't in the
// import) is the normal case — every preset only specifies a subset of
// fields — so it's treated as "use the default," not as a shape error.
function isCompatibleFieldValue(field, val) {
  if (val === undefined) return false;
  switch (field.type) {
    case "select":
    case "text":
      return typeof val === "string";
    case "multiselect":
      return Array.isArray(val);
    case "dualNumber":
      return !!val && typeof val === "object" && !Array.isArray(val) && typeof val.a === "number" && typeof val.b === "number";
    case "dualSelect":
      return !!val && typeof val === "object" && !Array.isArray(val) && typeof val.a === "string" && typeof val.b === "string";
    default:
      return true;
  }
}

// Fills in any field a partial config (a preset, a saved scenario, an
// imported file) doesn't specify with its PIECES default. Keeps presets/saves
// forward-compatible with new fields added after they were written, instead
// of requiring every one of them to be hand-edited whenever PIECES grows.
function mergeConfigWithDefaults(partialConfig) {
  const base = buildDefaultConfig();
  CATEGORY_ORDER.forEach((cat) => {
    let partial = (partialConfig && partialConfig[cat]) || {};
    if (typeof partial !== "object" || partial === null || Array.isArray(partial)) partial = {};
    if (cat === "core") partial = migrateLegacyAet(partial);
    const sanitized = {};
    PIECES[cat].fields.forEach((f) => {
      const val = partial[f.key];
      sanitized[f.key] = isCompatibleFieldValue(f, val) ? val : base[cat][f.key];
    });
    Object.assign(base[cat], sanitized);
  });
  return base;
}

function buildDefaultNotes() {
  const notes = {};
  CATEGORY_ORDER.forEach((cat) => {
    notes[cat] = {};
    PIECES[cat].fields.forEach((f) => {
      notes[cat][f.key] = "";
    });
  });
  return notes;
}

function buildDefaultDealDetails() {
  return { dealerName: "", counterpartyName: "", agreementDate: "" };
}

let STATE = {
  presetId: "blank",
  config: buildDefaultConfig(),
  notes: buildDefaultNotes(),
  vanillaMode: false,
  // Only meaningful while vanillaMode is on. "isdaCsa" (default) shows the
  // vanilla ISDA plus the vanilla CSA; "isdaOnly" additionally hides the
  // entire Attachments (CSA) quadrant, for a pure Master Agreement walkthrough.
  vanillaScope: "isdaCsa",
  // null = no custom filter (show everything, subject to conditionalOn/vanillaMode).
  // An array restricts the board to exactly those field keys; everything else
  // stays at its PIECES default and still counts toward scoring/outputs.
  focusFields: null,
  // Optional — feeds the Schedule's preamble (party names, execution date).
  // Any field left blank keeps that value as its bracketed placeholder
  // (e.g. "[DEALER LEGAL NAME]") in the generated document.
  dealDetails: buildDefaultDealDetails(),
  // Negotiation Scenarios (practice mode). null when not practicing;
  // otherwise { presetId, side } — side is "dealer" or "counterparty".
  // Deliberately not persisted/restored by undo-redo, same as vanillaMode.
  practice: null,
  // v3: id of the Matter currently loaded onto the board, or null if the
  // board is just the free-standing scratch config (v2 behavior). Set by
  // loadMatterRound(); the board itself still lives in STATE.config/notes —
  // a Matter's "current round" is just where that gets saved to/loaded from.
  activeMatterId: null,
  // v3: which of the active playbook's clauses the board currently departs
  // from — recomputed on every render, not persisted. See evaluatePlaybook().
  playbookId: null,
  // v3: id of the active favorability ruleset, or null to use this tool's
  // built-in dealer/buyside/neutral tags. See section 10j.
  favorabilityRulesetId: null,
};

const STORAGE_KEY = "isda-jigsaw-v3-state-v1";
const CUSTOM_SCENARIOS_KEY = "isda-jigsaw-v3-custom-scenarios";
const MATTERS_KEY = "isda-jigsaw-v3-matters";
const PLAYBOOKS_KEY = "isda-jigsaw-v3-playbooks";
const FAVORABILITY_RULESETS_KEY = "isda-jigsaw-v3-favorability-rulesets";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.config) {
        STATE = parsed;
        if (!STATE.notes) STATE.notes = buildDefaultNotes();
        if (!STATE.dealDetails) STATE.dealDetails = buildDefaultDealDetails();
        if (!STATE.vanillaScope) STATE.vanillaScope = "isdaCsa";
        if (STATE.activeMatterId === undefined) STATE.activeMatterId = null;
        if (STATE.playbookId === undefined) STATE.playbookId = null;
        if (STATE.favorabilityRulesetId === undefined) STATE.favorabilityRulesetId = null;
        if (STATE.config && STATE.config.core) STATE.config.core = migrateLegacyAet(STATE.config.core);
      }
    }
  } catch (e) {
    /* ignore corrupt storage */
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  } catch (e) {
    /* storage unavailable */
  }
}

function loadCustomScenarios() {
  try {
    const raw = localStorage.getItem(CUSTOM_SCENARIOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCustomScenarios(list) {
  try {
    localStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(list));
  } catch (e) {
    /* storage unavailable */
  }
}

/* ---------------------------------------------------------------------- */
/* 4. COMPATIBILITY & LOGIC ENGINE                                        */
/* ---------------------------------------------------------------------- */

function ratioLeverage(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo <= 0) return hi > 0 ? Infinity : 1;
  return hi / lo;
}

function evaluateRules(config) {
  const flags = [];

  // 1. Governing law vs CSA structure mismatch
  const law = config.frame.governingLaw;
  const csa = config.attachments.csaStructure;
  if ((law === "English" || law === "Irish") && csa === "vmPledgeNY") {
    flags.push({
      level: "error",
      title: "Governing law / CSA form mismatch",
      message:
        `${law} law Master Agreement paired with a New York-law Pledge Annex. A NY-law security ` +
        `interest is unlikely to be enforceable/perfected under ${law} law without significant adaptation. ` +
        `Use an English-law CSA (Title Transfer) or a jurisdiction-appropriate security deed instead.`,
    });
  }
  if (law === "NY" && csa === "vmTitleTransferEnglish") {
    flags.push({
      level: "warning",
      title: "Governing law / CSA form mismatch",
      message:
        "NY-law Master Agreement paired with an English-law Title Transfer CSA. Confirm local counsel has " +
        "adapted the annex — NY practice typically pairs with the NY Pledge Annex.",
    });
  }
  if (law === "Indian" && (csa === "vmPledgeNY" || csa === "vmTitleTransferEnglish")) {
    flags.push({
      level: "warning",
      title: "Governing law / CSA form mismatch",
      message:
        "Indian-law Master Agreement paired with a foreign-law CSA annex. Confirm the collateral annex is adapted " +
        "for FEMA/RBI compliance and Indian stamp duty — a domestically-drafted or CCIL-compatible collateral form is more typical.",
    });
  }

  // 2. AET dependency — process agent required
  if ((config.core.aet.a === "yes" || config.core.aet.b === "yes") && !config.core.processAgent.trim()) {
    flags.push({
      level: "error",
      title: "Missing dependency: Process Agent",
      message:
        "Automatic Early Termination is elected. AET elections in jurisdictions subject to insolvency stays " +
        "typically require a designated Process Agent for service of process to be named in the Schedule — this field is now required.",
    });
  }

  // 3. IM/UMR structure + low-quality eligible collateral
  if (config.attachments.csaStructure === "vmImBilateral" && config.attachments.eligibleCollateral.includes("equities") && config.attachments.haircutLevel !== "aggressive") {
    flags.push({
      level: "warning",
      title: "IM eligibility / segregation risk",
      message:
        "Bilateral IM (UMR-style) structures generally require high-quality, custodian-eligible collateral at a " +
        "third-party custodian. Listed equities are atypical IM collateral — confirm eligibility schedule and haircut add-ons.",
    });
  }

  // 4. Leverage / asymmetry detection on dual-number fields (uses effective,
  //    rating-adjusted amounts where the field supports rating-linked mode)
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      if (f.type !== "dualNumber") return;
      const raw = config[cat][f.key];
      const eff = effectiveDual(f, raw);
      const isEffective = f.ratingLinkable && raw.ratingLinked;
      const ratio = ratioLeverage(eff.a, eff.b);
      const suffix = isEffective ? " (effective, rating-adjusted)" : "";
      if (ratio >= 3 && ratio !== Infinity) {
        flags.push({
          level: "warning",
          title: `Asymmetrical ${f.label}`,
          message:
            `${f.partyALabel}: ${money(eff.a)}${suffix} vs ${f.partyBLabel}: ${money(eff.b)}${suffix} — ${ratio.toFixed(1)}x differential. ` +
            "Material asymmetry on a heavily-negotiated economic term; expect pushback from the disadvantaged party.",
        });
      } else if (ratio === Infinity) {
        flags.push({
          level: "warning",
          title: `Asymmetrical ${f.label}`,
          message: `${f.partyALabel}: ${money(eff.a)}${suffix} vs ${f.partyBLabel}: ${money(eff.b)}${suffix} — one side is set to zero while the other is materially positive.`,
        });
      }
    });
  });

  // 5. Broad set-off flag (always surfaced given non-standard status)
  if (config.inserts.setoff === "broad") {
    flags.push({
      level: "warning",
      title: "Broad set-off clause",
      message:
        "Cross-affiliate, unmatured, cross-currency set-off is a non-standard, aggressive insertion. It is a common " +
        "flashpoint in buy-side negotiations and may require reciprocal drafting to be market-acceptable.",
    });
  }

  // 6. Sole calc agent note
  if (config.edge.calcAgent === "dealerSole" || config.edge.calcAgent === "counterpartySole") {
    flags.push({
      level: "info",
      title: "Unilateral Calculation Agent",
      message:
        "A sole Calculation Agent (without a dispute-resolution / second-opinion mechanism) is a frequent negotiation " +
        "point, particularly on close-out valuation following ISDA 2002 §6(e).",
    });
  }

  // 7. Aggressive-count summary (3+ ATEs)
  const atesField = PIECES.core.fields.find((f) => f.key === "ates");
  if (atesField.aggressiveIf(config.core.ates)) {
    flags.push({
      level: "warning",
      title: "Stacked Additional Termination Events",
      message:
        "Three or more ATEs (NAV decline + Key Person + Downgrade) stacked together is aggressive and non-standard; " +
        "buy-side counterparties routinely resist stacking beyond one or two triggers.",
    });
  }

  // 8. FEMA / RBI approval pending — blocking
  if (config.inserts.regulatoryOverlay === "indiaOnshore" && config.inserts.femaCollateralApproval === "pending") {
    flags.push({
      level: "error",
      title: "FEMA approval pending",
      message:
        "The Indian onshore counterparty's cross-border collateral posting requires RBI approval under FEMA (or reliance " +
        "on the RBI Master Direction – Margin for Derivative Contracts general permission), which is marked as pending. " +
        "Collateral cannot be posted offshore until this is resolved.",
    });
  }

  // 9. India netting legislation note
  if (config.inserts.regulatoryOverlay === "indiaOnshore" && config.core.aet.a === "no" && config.core.aet.b === "no") {
    flags.push({
      level: "info",
      title: "India netting enforceability — confirm coverage",
      message:
        "Close-out netting with an Indian onshore counterparty relies on the Bilateral Netting of Qualified Financial " +
        "Contracts Act, 2020. Confirm the counterparty type and contract are within its notified scope before relying " +
        "on netting without AET.",
    });
  }

  // 10. GIFT City overlay note
  if (config.inserts.regulatoryOverlay === "giftCity") {
    flags.push({
      level: "info",
      title: "GIFT City IFSC — regulatory posture",
      message:
        "IFSCA-regulated entities in GIFT City are generally treated as offshore for FEMA purposes, so cross-border " +
        "collateral and payment restrictions applicable to onshore Indian residents typically do not apply. Confirm the " +
        "counterparty's IFSC registration category (e.g., Fund Management Entity) supports the intended trading activity.",
    });
  }

  // 11. Rating-linked threshold drafting note
  [
    { key: "crossDefaultThreshold", cat: "core", niceName: "Cross Default Threshold" },
    { key: "threshold", cat: "attachments", niceName: "CSA Threshold" },
  ].forEach(({ key, cat, niceName }) => {
    const val = config[cat][key];
    if (val && val.ratingLinked) {
      flags.push({
        level: "info",
        title: `Rating-linked ${niceName}`,
        message:
          "Effective amount auto-scales with each party's current credit rating tier. Ensure the Schedule defines the " +
          "applicable rating agency, tier boundaries, and cure mechanics on a ratings change.",
      });
    }
  });

  // 12. 1992-form close-out election vs. 2002-only sections
  if (config.core.closeoutMethodology === "marketQuotation1992" || config.core.closeoutMethodology === "loss1992") {
    flags.push({
      level: "info",
      title: "1992 Master Agreement form implied",
      message:
        "Market Quotation/Loss close-out methodology is a 1992-form election. The 2002-only Set-Off section (6(f)) and " +
        "Force Majeure Termination Event (5(b)(ii)) aren't available on that form — equivalent protection would need " +
        "bespoke Part 5 drafting if desired.",
    });
  }

  // 13. Asymmetric Credit Event Upon Merger
  if (config.core.creditEventUponMerger === "counterpartyOnly") {
    flags.push({
      level: "warning",
      title: "Asymmetric Credit Event Upon Merger",
      message:
        "Credit Event Upon Merger applies only to the Counterparty, giving the Dealer a unilateral termination right " +
        "tied to the Counterparty's M&A activity with no reciprocal right. Expect this to be a significant negotiation flashpoint.",
    });
  }

  // 14. Indian governing law paired with non-Indian jurisdiction
  const indianDisputeOptions = ["indianCourtsExclusive", "indianArbitration"];
  if (config.frame.governingLaw === "Indian" && !indianDisputeOptions.includes(config.frame.disputeResolution)) {
    flags.push({
      level: "warning",
      title: "Governing law / jurisdiction mismatch",
      message:
        "Indian-law Master Agreement paired with a foreign court or arbitral seat. Enforcing a foreign judgment in India " +
        "(or vice versa) can be slower and less certain than litigating or arbitrating within India — Indian courts or " +
        "India-seated arbitration under the Arbitration and Conciliation Act, 1996 is the more typical pairing.",
    });
  }

  // 15. Pledge CSA: no custodian stacked with full rehypothecation rights
  if (
    config.attachments.csaStructure === "vmPledgeNY" &&
    config.attachments.custodianArrangement === "none" &&
    config.attachments.rehypothecationRights === "full"
  ) {
    flags.push({
      level: "warning",
      title: "Custody / rehypothecation risk stacking",
      message:
        "The Secured Party holds pledged collateral directly (no independent custodian) and has an unrestricted right to " +
        "rehypothecate it. If the Secured Party defaults, the pledgor has both no independent safekeeping and no recall " +
        "right over its own collateral — a combination buy-side counsel routinely pushes back on together.",
    });
  }

  // 16. Bilateral IM: custodian selected at Secured Party's sole discretion
  if (config.attachments.csaStructure === "vmImBilateral" && config.attachments.custodianApproval === "securedPartyDiscretion") {
    flags.push({
      level: "info",
      title: "IM custodian selected unilaterally",
      message:
        "Letting the Secured Party choose the Initial Margin segregation custodian without the posting party's consent " +
        "sits in tension with UMR's segregation intent — most bilateral IM CSAs give both parties approval rights over " +
        "the custodian even though segregation itself is mandatory.",
    });
  }

  // 17. Broad Most Favored Nation clause
  if (config.inserts.mostFavoredNation === "broad") {
    flags.push({
      level: "warning",
      title: "Broad Most Favored Nation clause",
      message:
        "An MFN clause spanning pricing, credit, and collateral terms is rare in bilateral OTC derivatives relationships " +
        "and is operationally difficult for the Dealer to certify across its book. Expect significant resistance; a " +
        "pricing-only MFN against a defined peer group is the more common ask.",
    });
  }

  // 18. Uncapped non-cash collateral concentration paired with equities eligibility
  if (config.attachments.concentrationLimits === "none" && config.attachments.eligibleCollateral.includes("equities")) {
    flags.push({
      level: "warning",
      title: "Uncapped collateral concentration risk",
      message:
        "Listed equities are eligible collateral with no concentration limit in place. Without an issuer/asset-class cap, " +
        "the poster could deliver a concentrated, single-name equity position as collateral — exactly the wrong-way-risk " +
        "scenario concentration limits exist to prevent.",
    });
  }

  return flags;
}

/* ---------------------------------------------------------------------- */
/* 5. RISK BALANCE GAUGE                                                  */
/* ---------------------------------------------------------------------- */

function computeRiskScore(config) {
  let score = 0; // positive = dealer-favorable, negative = buy-side-favorable

  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      const val = config[cat][f.key];
      if (f.type === "select") {
        const opt = f.options.find((o) => o.value === val);
        if (!opt) return;
        const favors = effectiveFavors(cat, f.key, opt.value, opt.favors);
        const weight = opt.aggressive ? 18 : 10;
        if (favors === "dealer") score += weight;
        else if (favors === "buyside") score -= weight;
      } else if (f.type === "multiselect") {
        val.forEach((v) => {
          const opt = f.options.find((o) => o.value === v);
          if (!opt) return;
          const favors = effectiveFavors(cat, f.key, opt.value, opt.favors);
          const weight = opt.aggressive ? 10 : 6;
          if (favors === "dealer") score += weight;
          else if (favors === "buyside") score -= weight;
        });
      } else if (f.type === "dualNumber") {
        const eff = effectiveDual(f, val);
        const total = eff.a + eff.b;
        if (total > 0) {
          const normalizedDiff = (eff.b - eff.a) / total; // >0 means counterparty value higher
          score += f.polarity * -normalizedDiff * f.weight;
          // polarity=1 (threshold-like): higher counterparty value favors counterparty (buyside) => negative contribution
          // polarity=-1 (IA): higher counterparty value (posts more) favors dealer => positive contribution
        }
      } else if (f.type === "dualSelect") {
        const optA = f.options.find((o) => o.value === val.a);
        const optB = f.options.find((o) => o.value === val.b);
        const weight = 8;
        if (optA) {
          const favorsA = effectiveFavorsSide(cat, f.key, optA.value, "favorsA", optA.favorsA);
          if (favorsA === "dealer") score += weight;
          else if (favorsA === "buyside") score -= weight;
        }
        if (optB) {
          const favorsB = effectiveFavorsSide(cat, f.key, optB.value, "favorsB", optB.favorsB);
          if (favorsB === "dealer") score += weight;
          else if (favorsB === "buyside") score -= weight;
        }
      }
    });
  });

  return Math.max(-100, Math.min(100, Math.round(score)));
}

function leanClassFor(score) {
  if (score > 12) return "lean-dealer";
  if (score < -12) return "lean-buyside";
  return "lean-neutral";
}

/* ---------------------------------------------------------------------- */
/* 6. RENDERING                                                           */
/* ---------------------------------------------------------------------- */

function fieldPieceLean(cat, field) {
  const val = STATE.config[cat][field.key];
  if (field.type === "select") {
    const opt = field.options.find((o) => o.value === val);
    if (!opt) return { css: "lean-neutral", tags: [] };
    const favors = effectiveFavors(cat, field.key, opt.value, opt.favors);
    return { css: opt.aggressive ? "lean-aggressive" : `lean-${favors}`, tags: [tagFor(opt, favors)] };
  }
  if (field.type === "multiselect") {
    if (field.aggressiveIf && field.aggressiveIf(val)) return { css: "lean-aggressive", tags: [{ cls: "tag-aggressive", label: "Aggressive" }] };
    const resolved = val
      .map((v) => {
        const o = field.options.find((oo) => oo.value === v);
        return o ? { opt: o, favors: effectiveFavors(cat, field.key, o.value, o.favors) } : null;
      })
      .filter(Boolean);
    const tags = resolved.map(({ opt, favors }) => tagFor(opt, favors));
    const anyDealer = resolved.some(({ favors }) => favors === "dealer");
    const anyBuyside = resolved.some(({ favors }) => favors === "buyside");
    let css = "lean-neutral";
    if (anyDealer && !anyBuyside) css = "lean-dealer";
    else if (anyBuyside && !anyDealer) css = "lean-buyside";
    return { css, tags };
  }
  if (field.type === "dualNumber") {
    const eff = effectiveDual(field, val);
    const ratio = ratioLeverage(eff.a, eff.b);
    const tags = [];
    if (ratio >= 3 || ratio === Infinity) tags.push({ cls: "tag-aggressive", label: "Leverage flag" });
    if (field.ratingLinkable && val.ratingLinked) tags.push({ cls: "tag-note", label: "Rating-linked" });
    const normalizedDiff = eff.a + eff.b > 0 ? (eff.b - eff.a) / (eff.a + eff.b) : 0;
    const dealerLean = field.polarity * -normalizedDiff;
    let css = "lean-neutral";
    if (dealerLean > 0.15) css = "lean-dealer";
    else if (dealerLean < -0.15) css = "lean-buyside";
    return { css, tags };
  }
  if (field.type === "dualSelect") {
    const optA = field.options.find((o) => o.value === val.a);
    const optB = field.options.find((o) => o.value === val.b);
    const favorsA = optA ? effectiveFavorsSide(cat, field.key, optA.value, "favorsA", optA.favorsA) : null;
    const favorsB = optB ? effectiveFavorsSide(cat, field.key, optB.value, "favorsB", optB.favorsB) : null;
    const tags = [];
    if (optA) tags.push({ cls: `tag-${favorsA}`, label: `${field.partyALabel}: ${favorLabel(favorsA)}` });
    if (optB) tags.push({ cls: `tag-${favorsB}`, label: `${field.partyBLabel}: ${favorLabel(favorsB)}` });
    let dealerCount = 0;
    let buysideCount = 0;
    if (favorsA === "dealer") dealerCount++;
    if (favorsA === "buyside") buysideCount++;
    if (favorsB === "dealer") dealerCount++;
    if (favorsB === "buyside") buysideCount++;
    let css = "lean-neutral";
    if (dealerCount > buysideCount) css = "lean-dealer";
    else if (buysideCount > dealerCount) css = "lean-buyside";
    return { css, tags };
  }
  if (field.type === "text") {
    return { css: "lean-neutral", tags: [] };
  }
  return { css: "lean-neutral", tags: [] };
}

function favorLabel(favors) {
  return favors === "dealer" ? "Dealer" : favors === "buyside" ? "Buy-side" : "Neutral";
}

// `favors` is the resolved polarity to display — pass the effective value
// (built-in or ruleset-overridden) rather than reading opt.favors directly,
// so every caller reflects an active favorability ruleset uniformly.
// Callers that have no ruleset context yet may omit it and fall back to the
// option's own built-in favors.
function tagFor(opt, favors) {
  if (!opt) return null;
  if (opt.aggressive) return { cls: "tag-aggressive", label: "Aggressive" };
  const resolved = favors !== undefined ? favors : opt.favors;
  return { cls: `tag-${resolved}`, label: favorLabel(resolved) };
}

function fieldValueDisplay(cat, field) {
  return fieldValueDisplayFor(STATE.config, cat, field);
}

// Same formatting fieldValueDisplay uses for the live board, but against an
// arbitrary config object instead of STATE.config — lets the Compare feature
// render "what preset X says" without touching the current configuration.
function fieldValueDisplayFor(config, cat, field) {
  const val = config[cat][field.key];
  if (field.type === "select") {
    const opt = field.options.find((o) => o.value === val);
    return opt ? opt.label : "—";
  }
  if (field.type === "multiselect") {
    if (!val.length) return "None selected";
    return val.map((v) => field.options.find((o) => o.value === v)?.label).join(", ");
  }
  if (field.type === "dualNumber") {
    if (!field.ratingLinkable || !val.ratingLinked) {
      return `${field.partyALabel}: ${money(val.a)} · ${field.partyBLabel}: ${money(val.b)}`;
    }
    const eff = effectiveDual(field, val);
    const dealerTier = ratingTier(val.dealerRating).label;
    const cpTier = ratingTier(val.counterpartyRating).label;
    return (
      `${field.partyALabel} anchor ${money(val.a)} @ AA- → effective ${money(eff.a)} @ ${dealerTier} · ` +
      `${field.partyBLabel} anchor ${money(val.b)} @ AA- → effective ${money(eff.b)} @ ${cpTier}`
    );
  }
  if (field.type === "dualSelect") {
    const optA = field.options.find((o) => o.value === val.a);
    const optB = field.options.find((o) => o.value === val.b);
    return `${field.partyALabel}: ${optA ? optA.label : "—"} · ${field.partyBLabel}: ${optB ? optB.label : "—"}`;
  }
  if (field.type === "text") {
    return val ? val : "Not set";
  }
  return "";
}

// Checked live (computed style + actual box size) rather than against a
// remembered breakpoint, so it stays correct if the window is resized or
// opened small in the first place — not just at the widths the CSS was
// originally tuned for.
function isIsdaPanelVisible() {
  const panel = document.getElementById("isdaRefPanel");
  if (!panel) return false;
  const style = window.getComputedStyle(panel);
  return style.display !== "none" && panel.offsetWidth > 0 && panel.offsetHeight > 0;
}

let isdaRefClearTimeout = null;

function showIsdaRef(key) {
  if (isdaRefClearTimeout) {
    clearTimeout(isdaRefClearTimeout);
    isdaRefClearTimeout = null;
  }
  const body = document.getElementById("isdaRefBody");
  if (!body) return;
  const ref = ISDA_REFERENCES[key];
  if (!ref) {
    body.innerHTML = `<p class="isda-ref-placeholder">No standard ISDA section applies — this is a bespoke insertion typically added via Schedule Part 5 (Other Provisions) or a side letter.</p>`;
    return;
  }
  body.innerHTML = `
    <div class="isda-ref-doc">${ref.doc}</div>
    <div class="isda-ref-section">${ref.section}</div>
    <p class="isda-ref-desc">${ref.description}</p>
  `;
}

function clearIsdaRef() {
  isdaRefClearTimeout = setTimeout(() => {
    // While the edit modal is open, its own field owns the panel — ignore stray
    // mouseleave/blur events (e.g. from the click-triggered scroll-into-view).
    // closeModal() clears activeEdit first, then calls this directly, so an
    // intentional close still goes through.
    if (activeEdit) return;
    const body = document.getElementById("isdaRefBody");
    if (body) {
      body.innerHTML = `<p class="isda-ref-placeholder">Hover or focus a piece to see the relevant ISDA Master Agreement / CSA section.</p>`;
    }
  }, 150);
}

/* ---------------------------------------------------------------------- */
/* Custom tooltip — used by badges/note tags instead of the native title  */
/* attribute, which never fires on touch input or narrow/mobile viewports */
/* (there's no hover event to trigger it there). This version responds to */
/* mouse hover, keyboard focus, AND tap/click, so it works at any width.  */
/* ---------------------------------------------------------------------- */

function showCustomTooltip(anchorEl, text) {
  const tip = document.getElementById("customTooltip");
  if (!tip) return;
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.left = "0px";
  tip.style.top = "0px";

  const anchorRect = anchorEl.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 8;

  let left = anchorRect.left;
  const maxLeft = window.innerWidth - tipRect.width - margin;
  if (left > maxLeft) left = Math.max(margin, maxLeft);
  if (left < margin) left = margin;

  let top = anchorRect.bottom + 6;
  if (top + tipRect.height > window.innerHeight - margin) {
    top = anchorRect.top - tipRect.height - 6;
    if (top < margin) top = margin;
  }

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideCustomTooltip() {
  const tip = document.getElementById("customTooltip");
  if (tip) tip.style.display = "none";
}

function attachTooltip(el, text) {
  if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
  el.setAttribute("aria-label", text);
  const show = () => showCustomTooltip(el, text);
  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", hideCustomTooltip);
  el.addEventListener("focus", show);
  el.addEventListener("blur", hideCustomTooltip);
  el.addEventListener("click", (e) => {
    // Tapping a badge/note tag should reveal its tooltip, not trigger
    // whatever click behavior (e.g. opening the edit modal) sits on an
    // ancestor element — this is also the touch-device fallback.
    e.stopPropagation();
    show();
  });
}

function renderQuadrants() {
  CATEGORY_ORDER.forEach((cat) => {
    const quadrantEl = document.getElementById(`quadrant-${cat}`);
    const csaHiddenByScope = cat === "attachments" && STATE.vanillaMode && STATE.vanillaScope === "isdaOnly";
    if (quadrantEl) quadrantEl.classList.toggle("hidden", csaHiddenByScope);
    if (csaHiddenByScope) return;
    const container = document.getElementById(`pieces-${cat}`);
    container.innerHTML = "";
    PIECES[cat].fields.forEach((field) => {
      if (!fieldVisible(field, STATE.config, cat)) return;
      const lean = fieldPieceLean(cat, field);
      const noteText = STATE.notes && STATE.notes[cat] ? STATE.notes[cat][field.key] : "";
      const isdaRef = ISDA_REFERENCES[field.key];
      const card = document.createElement("div");
      card.className = `piece-card ${lean.css}`;
      card.setAttribute("data-field-key", field.key);
      card.setAttribute("data-field-cat", cat);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Edit ${field.label}`);
      card.innerHTML = `
        <div class="piece-card-title">${field.label}${isdaRef ? `<span class="isda-badge">${isdaRef.short}</span>` : ""}</div>
        <div class="piece-card-value">${fieldValueDisplay(cat, field)}</div>
        <div class="piece-card-tags">${lean.tags.map((t) => (t ? `<span class="tag ${t.cls}">${t.label}</span>` : "")).join("")}${noteText ? `<span class="tag tag-note piece-note-tag">📝 Note</span>` : ""}</div>
      `;
      card.addEventListener("click", () => openModal(cat, field));
      card.addEventListener("keypress", (e) => {
        if (e.key === "Enter") openModal(cat, field);
      });
      const titleEl = card.querySelector(".piece-card-title");
      const showCardIsdaRef = () => {
        showIsdaRef(field.key);
        // Only fall back to the floating tooltip when the aside panel is
        // genuinely not on screen right now — avoids a redundant popup next
        // to the card when the aside is already showing the same content.
        if (isdaRef && !isIsdaPanelVisible()) {
          showCustomTooltip(titleEl, `${isdaRef.doc} — ${isdaRef.section}. ${isdaRef.description}`);
        }
      };
      const hideCardIsdaRef = () => {
        clearIsdaRef();
        hideCustomTooltip();
      };
      // mouseover/mouseout (not mouseenter/mouseleave) so the badge/note-tag's
      // own tooltip lifecycle — precise hover/focus/tap on that small element
      // — isn't fought over by this card-wide fallback.
      card.addEventListener("mouseover", (e) => {
        if (e.target.closest(".isda-badge, .piece-note-tag")) return;
        showCardIsdaRef();
      });
      card.addEventListener("mouseout", (e) => {
        if (e.target.closest(".isda-badge, .piece-note-tag")) return;
        if (card.contains(e.relatedTarget)) return;
        hideCardIsdaRef();
      });
      card.addEventListener("focus", showCardIsdaRef);
      card.addEventListener("blur", hideCardIsdaRef);

      const badgeEl = card.querySelector(".isda-badge");
      if (badgeEl && isdaRef) {
        attachTooltip(badgeEl, `${isdaRef.doc} — ${isdaRef.section}. ${isdaRef.description}`);
      }
      const noteTagEl = card.querySelector(".piece-note-tag");
      if (noteTagEl && noteText) {
        attachTooltip(noteTagEl, noteText);
      }

      container.appendChild(card);
    });
    if (!container.children.length && (STATE.vanillaMode || STATE.focusFields)) {
      const reason = STATE.focusFields ? "Hidden by your clause filter" : "Hidden in Vanilla mode";
      const action = STATE.focusFields ? "Select Clauses… to add" : "toggle it off to add";
      container.innerHTML = `<p class="vanilla-empty-note">${reason} — ${action} bespoke ${PIECES[cat].label.toLowerCase()} customizations.</p>`;
    }
  });
}

function renderGauge() {
  const score = computeRiskScore(STATE.config);
  // Gradient runs dealer-blue (0%, left) -> buy-side-green (100%, right), and
  // score is positive=dealer-favorable, negative=buy-side-favorable, so a
  // higher score must move the marker toward 0%, not toward 100%.
  const pct = (100 - score) / 200; // 0..1
  const marker = document.getElementById("gaugeMarker");
  marker.style.left = `${pct * 100}%`;
  const label = document.getElementById("gaugeScoreLabel");
  let posture = "Balanced / Neutral";
  if (score > 40) posture = "Strongly Dealer-favorable";
  else if (score > 12) posture = "Dealer-leaning";
  else if (score < -40) posture = "Strongly Buy-side-favorable";
  else if (score < -12) posture = "Buy-side-leaning";
  label.textContent = `Score: ${score} (${posture})`;
}

function renderFlags() {
  const flags = evaluateRules(STATE.config);
  const list = document.getElementById("flagsList");
  if (!flags.length) {
    list.innerHTML = `<p class="flags-empty">No conflicts detected.</p>`;
    return;
  }
  list.innerHTML = flags
    .map(
      (f) => `
      <div class="flag flag-${f.level}">
        <strong>${f.level === "error" ? "⛔" : f.level === "warning" ? "⚠️" : "ℹ️"} ${f.title}</strong>
        ${f.message}
      </div>`
    )
    .join("");
}

function renderAll() {
  renderQuadrants();
  renderGauge();
  renderFlags();
  applyGuardrailTags();
  updateFavorabilityBar();
  saveState();
}

/* ---------------------------------------------------------------------- */
/* 7. MODAL — piece parameter editor                                      */
/* ---------------------------------------------------------------------- */

let activeEdit = null;

function openModal(cat, field) {
  activeEdit = { cat, field };
  const isdaRef = ISDA_REFERENCES[field.key];
  const modalTitleEl = document.getElementById("modalTitle");
  modalTitleEl.innerHTML = `${field.label}${isdaRef ? `<span class="modal-title-badge">${isdaRef.short}</span>` : ""}`;
  const modalBadgeEl = modalTitleEl.querySelector(".modal-title-badge");
  if (modalBadgeEl && isdaRef) {
    attachTooltip(modalBadgeEl, `${isdaRef.doc} — ${isdaRef.section}. ${isdaRef.description}`);
  }
  showIsdaRef(field.key);
  const body = document.getElementById("modalBody");
  body.innerHTML = "";

  if (field.type === "select") {
    body.appendChild(buildSelectInput(cat, field, STATE.config[cat][field.key]));
  } else if (field.type === "multiselect") {
    body.appendChild(buildMultiselectInput(field, STATE.config[cat][field.key]));
  } else if (field.type === "dualNumber") {
    body.appendChild(buildDualNumberInput(field, STATE.config[cat][field.key]));
  } else if (field.type === "dualSelect") {
    body.appendChild(buildDualSelectInput(cat, field, STATE.config[cat][field.key]));
  } else if (field.type === "text") {
    body.appendChild(buildTextInput(field, STATE.config[cat][field.key]));
  }

  const notesCurrent = STATE.notes && STATE.notes[cat] ? STATE.notes[cat][field.key] : "";
  body.appendChild(buildNotesInput(notesCurrent));

  document.getElementById("modalOverlay").classList.remove("hidden");
}

function buildSelectInput(cat, field, current) {
  const wrap = document.createElement("div");
  wrap.className = "field-group";
  const label = document.createElement("label");
  label.textContent = field.label;
  wrap.appendChild(label);
  const select = document.createElement("select");
  select.id = "modalInputSelect";
  field.options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === current) o.selected = true;
    select.appendChild(o);
  });
  wrap.appendChild(select);
  const note = document.createElement("div");
  note.id = "modalOptionNote";
  note.className = "option-note";
  wrap.appendChild(note);
  const updateNote = () => {
    const opt = field.options.find((o) => o.value === select.value);
    if (!opt) return;
    const favors = effectiveFavors(cat, field.key, opt.value, opt.favors);
    const tag = tagFor(opt, favors);
    note.className = `option-note tag ${tag.cls}`;
    note.textContent = `${tag.label}${opt.aggressive ? " · flagged as non-standard" : ""}`;
  };
  select.addEventListener("change", updateNote);
  updateNote();
  return wrap;
}

function buildMultiselectInput(field, current) {
  const wrap = document.createElement("div");
  wrap.className = "field-group";
  const label = document.createElement("label");
  label.textContent = field.label;
  wrap.appendChild(label);
  field.options.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "checkbox-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt.value;
    cb.id = `ms-${opt.value}`;
    cb.checked = current.includes(opt.value);
    cb.className = "modal-multiselect-input";
    const lbl = document.createElement("label");
    lbl.setAttribute("for", cb.id);
    lbl.style.textTransform = "none";
    lbl.style.fontWeight = "400";
    lbl.style.margin = "0";
    lbl.textContent = opt.label;
    row.appendChild(cb);
    row.appendChild(lbl);
    wrap.appendChild(row);
  });
  return wrap;
}

function buildDualNumberInput(field, current) {
  const wrap = document.createElement("div");
  wrap.className = "field-group";
  const label = document.createElement("label");
  label.textContent = field.label;
  wrap.appendChild(label);
  const row = document.createElement("div");
  row.className = "dual-row";
  row.innerHTML = `
    <div><span>${field.partyALabel}${field.ratingLinkable ? " (AA- anchor)" : ""}</span><input type="number" id="dualA" min="0" step="1000" value="${current.a}"></div>
    <div><span>${field.partyBLabel}${field.ratingLinkable ? " (AA- anchor)" : ""}</span><input type="number" id="dualB" min="0" step="1000" value="${current.b}"></div>
  `;
  wrap.appendChild(row);
  const hint = document.createElement("div");
  hint.className = "field-hint";
  hint.textContent = "A ratio of 3x or more between the two parties triggers a leverage flag.";
  wrap.appendChild(hint);

  if (field.ratingLinkable) {
    const rlWrap = document.createElement("div");
    rlWrap.className = "checkbox-row";
    rlWrap.style.marginTop = "10px";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "dualRatingLinked";
    cb.checked = !!current.ratingLinked;
    const lbl = document.createElement("label");
    lbl.setAttribute("for", "dualRatingLinked");
    lbl.style.textTransform = "none";
    lbl.style.fontWeight = "400";
    lbl.style.margin = "0";
    lbl.textContent = "Rating-linked (effective amount steps with credit rating)";
    rlWrap.appendChild(cb);
    rlWrap.appendChild(lbl);
    wrap.appendChild(rlWrap);

    const ratingRow = document.createElement("div");
    ratingRow.className = "dual-row rating-linked-row";
    ratingRow.id = "ratingLinkedRow";
    ratingRow.style.marginTop = "8px";
    ratingRow.style.display = cb.checked ? "flex" : "none";

    const buildRatingSelect = (id, currentKey) => {
      const holder = document.createElement("div");
      const span = document.createElement("span");
      span.textContent = id === "dealerRatingSelect" ? `${field.partyALabel} current rating` : `${field.partyBLabel} current rating`;
      holder.appendChild(span);
      const sel = document.createElement("select");
      sel.id = id;
      RATING_TIERS.forEach((tier) => {
        const o = document.createElement("option");
        o.value = tier.key;
        o.textContent = `${tier.label} (×${tier.multiplier})`;
        if (tier.key === currentKey) o.selected = true;
        sel.appendChild(o);
      });
      holder.appendChild(sel);
      return holder;
    };

    ratingRow.appendChild(buildRatingSelect("dealerRatingSelect", current.dealerRating || "a"));
    ratingRow.appendChild(buildRatingSelect("counterpartyRatingSelect", current.counterpartyRating || "a"));
    wrap.appendChild(ratingRow);

    const rlHint = document.createElement("div");
    rlHint.className = "field-hint";
    rlHint.textContent = "Effective amount = anchor × rating-tier multiplier (AA- ×1.5, A ×1.0, BBB ×0.5, sub-investment-grade ×0.15).";
    wrap.appendChild(rlHint);

    cb.addEventListener("change", () => {
      ratingRow.style.display = cb.checked ? "flex" : "none";
    });
  }

  return wrap;
}

function buildDualSelectInput(cat, field, current) {
  const wrap = document.createElement("div");
  wrap.className = "field-group";
  const label = document.createElement("label");
  label.textContent = field.label;
  wrap.appendChild(label);
  const row = document.createElement("div");
  row.className = "dual-row";

  const buildSide = (id, sideLabel, currentValue, favorsKey) => {
    const holder = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = sideLabel;
    holder.appendChild(span);
    const sel = document.createElement("select");
    sel.id = id;
    field.options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === currentValue) o.selected = true;
      sel.appendChild(o);
    });
    holder.appendChild(sel);
    const note = document.createElement("div");
    note.className = "option-note";
    const updateNote = () => {
      const opt = field.options.find((o) => o.value === sel.value);
      if (!opt) return;
      const favors = effectiveFavorsSide(cat, field.key, opt.value, favorsKey, opt[favorsKey]);
      note.className = `option-note tag tag-${favors}`;
      note.textContent = favorLabel(favors);
    };
    sel.addEventListener("change", updateNote);
    updateNote();
    holder.appendChild(note);
    return holder;
  };

  row.appendChild(buildSide("dualSelectA", field.partyALabel, current.a, "favorsA"));
  row.appendChild(buildSide("dualSelectB", field.partyBLabel, current.b, "favorsB"));
  wrap.appendChild(row);
  return wrap;
}

function buildTextInput(field, current) {
  const wrap = document.createElement("div");
  wrap.className = "field-group";
  const label = document.createElement("label");
  label.textContent = field.label;
  wrap.appendChild(label);
  const input = document.createElement("input");
  input.type = "text";
  input.id = "modalInputText";
  input.value = current;
  input.placeholder = field.placeholder || "";
  wrap.appendChild(input);
  return wrap;
}

function buildNotesInput(current) {
  const wrap = document.createElement("div");
  wrap.className = "field-group";
  const label = document.createElement("label");
  label.textContent = "Deal Notes (optional — included in the Term Sheet)";
  wrap.appendChild(label);
  const textarea = document.createElement("textarea");
  textarea.id = "modalInputNotes";
  textarea.className = "notes-textarea";
  textarea.rows = 3;
  textarea.placeholder = "e.g., Counsel flagged this on 3/1; hold position pending credit committee sign-off.";
  textarea.value = current || "";
  wrap.appendChild(textarea);
  return wrap;
}

function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
  activeEdit = null;
  clearIsdaRef();
}

function saveModal() {
  if (!activeEdit) return;
  pushHistory();
  const { cat, field } = activeEdit;
  if (field.type === "select") {
    STATE.config[cat][field.key] = document.getElementById("modalInputSelect").value;
  } else if (field.type === "multiselect") {
    const checked = Array.from(document.querySelectorAll(".modal-multiselect-input"))
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    STATE.config[cat][field.key] = checked;
  } else if (field.type === "dualNumber") {
    // The input's min="0" doesn't stop a typed negative value from being
    // read back — clamp here too, since these amounts flow straight into
    // drafted Schedule/CSA text (e.g. "Dealer: $-5,000,000") as well as the
    // risk score.
    const a = Math.max(0, Number(document.getElementById("dualA").value) || 0);
    const b = Math.max(0, Number(document.getElementById("dualB").value) || 0);
    if (field.ratingLinkable) {
      const ratingLinked = document.getElementById("dualRatingLinked").checked;
      const dealerRating = document.getElementById("dealerRatingSelect").value;
      const counterpartyRating = document.getElementById("counterpartyRatingSelect").value;
      STATE.config[cat][field.key] = { a, b, ratingLinked, dealerRating, counterpartyRating };
    } else {
      STATE.config[cat][field.key] = { a, b };
    }
  } else if (field.type === "dualSelect") {
    STATE.config[cat][field.key] = {
      a: document.getElementById("dualSelectA").value,
      b: document.getElementById("dualSelectB").value,
    };
  } else if (field.type === "text") {
    STATE.config[cat][field.key] = document.getElementById("modalInputText").value;
  }

  if (!STATE.notes) STATE.notes = buildDefaultNotes();
  if (!STATE.notes[cat]) STATE.notes[cat] = {};
  STATE.notes[cat][field.key] = document.getElementById("modalInputNotes").value;

  closeModal();
  renderAll();
}

/* ---------------------------------------------------------------------- */
/* 8. OUTPUT GENERATORS                                                   */
/* ---------------------------------------------------------------------- */

function fieldLine(cat, field) {
  if (!fieldVisible(field, STATE.config, cat)) return null;
  const noteText = STATE.notes && STATE.notes[cat] ? STATE.notes[cat][field.key] : "";
  const base = `  • ${field.label}: ${fieldValueDisplay(cat, field)}`;
  return noteText ? `${base}\n      Note: ${noteText}` : base;
}

function generateTermSheet() {
  const lines = [];
  lines.push("EXECUTABLE TERM SHEET");
  lines.push("ISDA Master Agreement — Schedule & CSA Configuration");
  lines.push("=".repeat(60));
  lines.push("");
  const preset = PRESETS.find((p) => p.id === STATE.presetId);
  if (preset && preset.id !== "blank") {
    lines.push(`Scenario: ${preset.name}`);
    lines.push(preset.description);
    lines.push("");
  }
  CATEGORY_ORDER.forEach((cat) => {
    lines.push(`${PIECES[cat].label.toUpperCase()}`);
    PIECES[cat].fields.forEach((f) => {
      const line = fieldLine(cat, f);
      if (line) lines.push(line);
    });
    lines.push("");
  });
  const score = computeRiskScore(STATE.config);
  lines.push("RISK BALANCE");
  lines.push(`  Score: ${score} (-100 = strongly buy-side, +100 = strongly dealer)`);
  lines.push("");
  const flags = evaluateRules(STATE.config);
  if (flags.length) {
    lines.push("OPEN COMPATIBILITY FLAGS");
    flags.forEach((f) => lines.push(`  [${f.level.toUpperCase()}] ${f.title}: ${f.message}`));
  } else {
    lines.push("OPEN COMPATIBILITY FLAGS: none detected.");
  }
  lines.push("");
  lines.push("This term sheet is a joke, nearly as big a one as you're apt to become if you rely exclusively on this.");
  return lines.join("\n");
}

const FALLBACK_TEMPLATES = {
  governingLaw: {
    fallback: "Accept an alternate governing law only where local legal opinion confirms netting/close-out enforceability and the CSA form is correspondingly adapted.",
    walkaway: "Governing law lacking a supporting netting opinion in the counterparty's or dealer's home jurisdiction.",
  },
  multibranch: {
    fallback: "Accept multibranch status limited to a pre-agreed list of Offices, with counterparty consent required to add new Offices.",
    walkaway: "Unrestricted multibranch booking with no notice or consent rights.",
  },
  paymentNetting: {
    fallback: "Same-currency/same-date netting (ISDA default) if full cross-transaction netting is rejected.",
    walkaway: "No payment netting at all on a high-volume relationship (operational risk).",
  },
  crossDefaultThreshold: {
    fallback: "Symmetric threshold set at the lower of the two parties' natural levels, or a formula tied to a percentage of net worth / regulatory capital. Consider enabling this tool's rating-linked mode so the threshold auto-scales with credit quality instead of being renegotiated on every downgrade.",
    walkaway: "Threshold set so low relative to the counterparty's balance sheet that immaterial defaults trigger cross default.",
  },
  crossDefaultType: {
    fallback: "Default-only trigger (narrower) with a carve-out for technical/administrative defaults.",
    walkaway: "Acceleration-only or anticipatory triggers with no cure period.",
  },
  specifiedIndebtednessScope: {
    fallback: "At minimum the standard banking carve-out (ordinary-course deposits excluded); for a fund counterparty, also carve out repo/securities-lending/margin financing used for portfolio financing, subject to a short payment-default cure period.",
    walkaway: "An unamended, all-inclusive Specified Indebtedness definition applied to a fund counterparty whose core financing activity would otherwise itself be a constant cross-default trigger.",
  },
  specifiedEntities: {
    fallback: "Named material subsidiaries or Credit Support Providers only, refreshed periodically by notice rather than automatically capturing all future affiliates.",
    walkaway: "Automatic inclusion of all present and future affiliates worldwide with no materiality qualifier.",
  },
  ates: {
    fallback: "At most one ATE (typically NAV decline for funds), sized to a materiality threshold with a cure/cooling-off period.",
    walkaway: "Three or more stacked ATEs with no cure rights, effectively giving the dealer a hair-trigger exit.",
  },
  aet: {
    fallback: "Apply AET to whichever party's own insolvency regime creates a stay risk (commonly the Counterparty), and disapply it for the other unless that party has the same exposure.",
    walkaway: "AET applied to a party in a jurisdiction with no clear legal basis for it, or applied to either party without a named process agent.",
  },
  processAgent: {
    fallback: "A well-established corporate process agent in the relevant financial center (e.g., CT Corporation in New York, Law Debenture in London).",
    walkaway: "No process agent named where AET or a foreign-law Master Agreement requires one.",
  },
  csaStructure: {
    fallback: "VM-only CSA matched to governing law, with IM added later only if UMR phase-in applies to the counterparty.",
    walkaway: "A CSA form mismatched to governing law with no adaptation opinion.",
  },
  independentAmount: {
    fallback: "A modest, credit-quality-linked IA (e.g., tied to a ratings grid) rather than a flat punitive amount.",
    walkaway: "An IA so large it functions as de facto pre-funded margin disconnected from actual exposure.",
  },
  threshold: {
    fallback: "Thresholds calibrated to each party's credit quality, potentially stepping down on a ratings downgrade — this tool's rating-linked mode can model that automatically.",
    walkaway: "A threshold so high for one party that meaningful uncollateralized exposure persists indefinitely.",
  },
  mta: {
    fallback: "A standard market MTA (typically $100k–$500k) applied symmetrically.",
    walkaway: "An MTA so large that it defeats the purpose of daily margining.",
  },
  eligibleCollateral: {
    fallback: "Cash plus high-quality government securities (including local-currency government securities where the counterparty is domestic), with haircuts on anything else.",
    walkaway: "Illiquid or single-name equity collateral accepted at zero or minimal haircut.",
  },
  haircutLevel: {
    fallback: "Standard published haircut schedule (e.g., ISDA/SIMM-aligned) rather than a bespoke bilateral schedule.",
    walkaway: "Haircuts set unilaterally by one party with no objection/dispute mechanism.",
  },
  concentrationLimits: {
    fallback: "Standard caps (e.g., 20% per issuer/asset class), tightened further only for genuinely illiquid or correlated collateral types.",
    walkaway: "No concentration limits at all on a basket that includes anything beyond cash and top-tier government bonds.",
  },
  interestRateCashCollateral: {
    fallback: "The relevant risk-free rate (SOFR/€STR/etc.) flat, with a modest negotiated spread only where the dealer's own funding cost genuinely justifies one.",
    walkaway: "A spread so wide below the reference rate that posted cash collateral becomes a below-market funding source for the dealer.",
  },
  valuationAgent: {
    fallback: "A sole Valuation Agent (typically the dealer, for operational simplicity) paired with disclosed methodology and a Paragraph 5 dispute mechanism.",
    walkaway: "A sole Valuation Agent with no disclosure obligation and no dispute-resolution recourse for the other party.",
  },
  disputeResolutionTiming: {
    fallback: "The CSA-default 1 Local Business Day resolution window, applied symmetrically to both parties.",
    walkaway: "A resolution window so extended that a disputed margin call sits unresolved through multiple additional valuation cycles.",
  },
  demandMechanic: {
    fallback: "The standard on-demand mechanic, provided demand timing and cutoff times are clearly specified.",
    walkaway: "An on-demand mechanic with no defined demand deadline, letting the Transferee time demands opportunistically.",
  },
  distributionsElection: {
    fallback: "Distributions passed back to the Transferor as a default election, departed from only for a specific, disclosed reason.",
    walkaway: "Distributions silently retained by the Transferee with no election made or disclosed at all.",
  },
  custodianArrangement: {
    fallback: "A third-party custodian meeting agreed, objectively verifiable Eligible Custodian criteria (rating, jurisdiction).",
    walkaway: "Collateral held directly by the Secured Party with no custodian and no independent safekeeping at all.",
  },
  rehypothecationRights: {
    fallback: "Rehypothecation permitted but subject to a recall right on reasonable notice, balancing dealer funding flexibility against counterparty return risk.",
    walkaway: "Unrestricted rehypothecation rights with no recall right and no disclosure of how posted collateral is being used.",
  },
  substitutionConsent: {
    fallback: "Substitution permitted subject to Secured Party consent, not to be unreasonably withheld or delayed.",
    walkaway: "Substitution left entirely to the Secured Party's unfettered discretion, effectively trapping the pledgor's collateral choices.",
  },
  imCalculationMethod: {
    fallback: "ISDA SIMM where both parties can support the governance/backtesting overhead; the Standardized Schedule otherwise, accepting the more conservative IM number.",
    walkaway: "SIMM adopted without a documented backtesting and dispute process, or a bespoke calculation method with no regulatory grounding.",
  },
  segregationStructure: {
    fallback: "A third-party segregated account satisfying UMR's no-rehypothecation mandate, with a tri-party structure only where added oversight justifies the cost.",
    walkaway: "An IM structure that permits rehypothecation or commingling in a way inconsistent with UMR segregation requirements.",
  },
  custodianApproval: {
    fallback: "Custodian selection and replacement subject to mutual consent, from a shortlist of well-established tri-party/custodian banks.",
    walkaway: "Custodian selected at the Secured Party's sole discretion with no approval right for the posting party.",
  },
  taxReps: {
    fallback: "Standard FATCA representations (plus local withholding-tax reps, e.g., Indian Section 195/DTAA, where the counterparty's residency requires it); add 871(m) only where the product suite requires it.",
    walkaway: "Broad, open-ended tax representations with no knowledge/materiality qualifiers.",
  },
  grossUp: {
    fallback: "Gross-up limited to Indemnifiable Taxes only, consistent with the ISDA definitions, not all withholding.",
    walkaway: "Unlimited gross-up obligation regardless of the taxpayer's own compliance failures.",
  },
  documentsDelivered: {
    fallback: "Tax forms and organizational documents only, with credit support/process agent documents added if those provisions apply.",
    walkaway: "An open-ended 'such other documents as reasonably requested' obligation with no time limit.",
  },
  calcAgent: {
    fallback: "Sole calculation agent (usually the dealer, for operational simplicity) paired with a second-opinion/dispute mechanism on close-out amounts.",
    walkaway: "Sole calculation agent with no dispute-resolution mechanism at all on close-out valuation.",
  },
  sanctionsAML: {
    fallback: "Standard sanctions representation without an independent termination right layered on top.",
    walkaway: "A sanctions clause broad enough to allow termination for conduct unrelated to the counterparty itself.",
  },
  setoff: {
    fallback: "Narrow set-off (matured, same currency and legal entity) rather than broad cross-affiliate set-off.",
    walkaway: "Broad, unmatured, cross-currency, cross-affiliate set-off with no reciprocity.",
  },
  illegalityFM: {
    fallback: "The ISDA 2002 default 3 business day waiting period.",
    walkaway: "A 0-day immediate termination right for illegality/force majeure with no opportunity to transfer/cure.",
  },
  illegalityDesignationRight: {
    fallback: "The default rule — either Affected Party may designate, cherry-picking only genuinely-affected Transactions.",
    walkaway: "Sole designation control handed to the Non-Affected Party, letting it time the termination to its own market advantage.",
  },
  regulatoryOverlay: {
    fallback: "Identify the overlay early (e.g., India onshore vs. GIFT City IFSC) so downstream FEMA/collateral fields are configured correctly from the outset.",
    walkaway: "Proceeding to document without confirming which regulatory overlay applies, risking a FEMA or EMIR/Dodd-Frank compliance gap discovered post-signing.",
  },
  femaCollateralApproval: {
    fallback: "General permission under the RBI Master Direction – Margin for Derivative Contracts, confirmed in writing by the counterparty's compliance function.",
    walkaway: "Posting or receiving offshore collateral before FEMA/RBI approval status is confirmed.",
  },
  disputeResolution: {
    fallback: "Non-exclusive jurisdiction of a neutral, well-established financial center's courts (NY or London) if arbitration is rejected.",
    walkaway: "A forum with no developed derivatives case law, or a jurisdiction where judgments against the other party aren't reliably enforceable.",
  },
  transferAssignment: {
    fallback: "Mutual consent (not unreasonably withheld) with a carve-out allowing either party to transfer to a wholly-owned Affiliate that assumes the obligations.",
    walkaway: "One party free to transfer at will while the other needs consent for every transfer, including to its own Affiliates.",
  },
  sovereignImmunityWaiver: {
    fallback: "A waiver of suit that preserves immunity from execution against central bank reserves and diplomatic-use property, consistent with customary international law.",
    walkaway: "No waiver at all from a counterparty capable of invoking sovereign immunity, leaving the Dealer without a practical remedy on default.",
  },
  bankruptcyCarveout: {
    fallback: "A carve-out for a regulated entity's own resolution/administration regime, or genuinely technical/non-payment insolvency events, rather than shortening grace periods across the board.",
    walkaway: "A compressed grace period applied to a regulated fund structure, risking default on a routine, non-credit-driven administrative filing.",
  },
  taxEventUponMerger: {
    fallback: "Keep it applicable but symmetric, rather than excluding it outright — it's a standard, evenly-shared risk allocation for tax law changes triggered by M&A.",
    walkaway: "Excluding Tax Event Upon Merger entirely for a party whose corporate structure is genuinely likely to be restructured.",
  },
  creditEventUponMerger: {
    fallback: "Applicable to both parties symmetrically, with a materiality/net-worth threshold rather than a bare downgrade test.",
    walkaway: "Applicable only to the Counterparty, giving the Dealer a unilateral exit right on the Counterparty's M&A activity with none of its own.",
  },
  terminationCurrency: {
    fallback: "USD (or another liquid, freely convertible currency) rather than an illiquid or restricted local currency.",
    walkaway: "A currency subject to convertibility or transfer restrictions that could trap a close-out payment.",
  },
  closeoutMethodology: {
    fallback: "The 2002 form's Close-out Amount standard, which requires commercially reasonable procedures and is the modern market default.",
    walkaway: "Loss under the 1992 form with no dispute-resolution or reasonableness backstop.",
  },
  creditSupportProvider: {
    fallback: "A guarantee running in the direction that actually needs it — typically the Dealer's if the Counterparty is the more credit-sensitive party — rather than defaulting to none at all.",
    walkaway: "A guarantee structure that runs only in the stronger party's favor, leaving the weaker party's counterparty risk fully uncovered.",
  },
  failureToPayGracePeriod: {
    fallback: "A narrow operational-error carve-out (genuine ops/admin/technical failures only) curable within a short, defined window after notice — not a general grace period on payment obligations.",
    walkaway: "No carve-out at all, so a purely administrative settlement glitch (e.g., a wire sent to the wrong cutoff) becomes a full Event of Default.",
  },
  defaultInterestSpread: {
    fallback: "A single, symmetric default-rate formula that applies the same spread to both parties' overdue amounts.",
    walkaway: "A punitive, asymmetric default rate that costs the Counterparty materially more than it would cost the Dealer.",
  },
  protocolAdherence: {
    fallback: "Adhere to the protocols relevant to the product mix and counterparty type (at minimum IBOR Fallbacks and, if in scope, VM) rather than negotiating bespoke equivalent language.",
    walkaway: "Trading uncleared derivatives with a counterparty that hasn't adhered to a protocol regulation requires before trading can continue.",
  },
  resolutionStayRecognition: {
    fallback: "Scope the contractual stay to the regulatory minimum actually compelled for the parties involved, rather than a broader stay negotiated in.",
    walkaway: "Full contractual stay language accepted by a counterparty that isn't actually in-scope for any resolution regime, ceding optionality for no regulatory benefit.",
  },
  confirmationMethod: {
    fallback: "Electronic confirmation via an established platform for any meaningful trading volume, with paper reserved for bespoke or one-off trades.",
    walkaway: "No defined confirmation method at all, leaving open questions about what evidences an agreed Transaction.",
  },
  noticeMethodCloseout: {
    fallback: "Email valid for all notices, matching how the relationship actually operates day to day — reserve fax/hand-delivery formality for genuinely disputed situations.",
    walkaway: "A strict 1992-style reading applied by surprise mid-relationship, where a counterparty argues a validly-sent email close-out notice was never effective.",
  },
  escrowNonSimultaneous: {
    fallback: "Add an escrow mechanism only for products/currency pairs with genuine cross-timezone settlement risk, rather than as a blanket requirement.",
    walkaway: "No escrow mechanism at all on a high-volume, cross-timezone FX or cross-currency relationship with material daily settlement risk.",
  },
  confidentiality: {
    fallback: "A mutual confidentiality clause with standard carve-outs for regulators, auditors, and legal process.",
    walkaway: "A one-way confidentiality obligation that binds only the party with less negotiating leverage.",
  },
  recordingConsent: {
    fallback: "A standard MiFID II-style consent to recording of calls and electronic communications, mirroring the Dealer's own regulatory recordkeeping obligations.",
    walkaway: "No recording consent at all, which can leave the Dealer unable to comply with its own recordkeeping regulations.",
  },
  nonRelianceECP: {
    fallback: "Standard non-reliance and Eligible Contract Participant representations, consistent with market practice for the counterparty type.",
    walkaway: "No ECP representation from a counterparty that doesn't in fact qualify, creating regulatory risk under the Commodity Exchange Act framework.",
  },
  noAgencyRepresentation: {
    fallback: "Qualify the representation precisely for the agency/investment-manager structure actually in place, rather than leaving an inaccurate 'acting as principal' rep on the record.",
    walkaway: "An unmodified No Agency rep signed by a party that is, in fact, trading as agent for undisclosed underlying principals.",
  },
  fishOrCutBait: {
    fallback: "A defined but reasonable window (e.g., 20–30 business days from actual knowledge of the Event of Default) to designate, rather than no limit at all.",
    walkaway: "An unlimited, open-ended right to designate an Early Termination Date at any future time, letting the Non-defaulting Party cherry-pick market timing indefinitely.",
  },
  mostFavoredNation: {
    fallback: "No MFN clause, or at most a narrow pricing-only MFN if the relationship size genuinely warrants it.",
    walkaway: "A broad MFN spanning credit and collateral terms, which is operationally difficult for the Dealer to certify and rare even for large buy-side relationships.",
  },
  portfolioCompression: {
    fallback: "Automatic participation via an established multilateral compression protocol, consistent with the Protocol Adherence election.",
    walkaway: "Compression happening entirely at one party's discretion with no visibility or consent from the other before Transactions are torn up.",
  },
};

function generateFallbackMatrix() {
  const rows = [];
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      if (!fieldVisible(f, STATE.config, cat)) return;
      const tmpl = FALLBACK_TEMPLATES[f.key] || { fallback: "Case-by-case.", walkaway: "Materially prejudicial to the disadvantaged party." };
      rows.push({
        category: PIECES[cat].label,
        piece: f.label,
        leanTag: fieldPieceLean(cat, f).css.replace("lean-", ""),
        target: fieldValueDisplay(cat, f),
        fallback: tmpl.fallback,
        walkaway: tmpl.walkaway,
      });
    });
  });
  return rows;
}

const DEFENSE_TEMPLATES = {
  governingLaw: {
    pushback: "Counterparty's home jurisdiction counsel is unfamiliar with the proposed governing law and wants to use their own law.",
    counter: "Point to the netting opinion coverage and existing ISDA protocol adherence for the proposed law; offer to share the relevant legal opinion.",
  },
  multibranch: {
    pushback: "Counterparty objects to unrestricted booking flexibility, citing uncertainty over which Office bears counterparty credit risk.",
    counter: "Offer a defined, consent-gated list of eligible Offices rather than removing multibranch status entirely.",
  },
  paymentNetting: {
    pushback: "Counterparty's operations team flags netting as adding settlement complexity.",
    counter: "Explain netting reduces gross settlement/operational risk for both sides and is standard market practice under the ISDA definitions.",
  },
  crossDefaultThreshold: {
    pushback: "Counterparty argues the threshold is too low relative to its balance sheet and could be triggered by immaterial defaults.",
    counter: "Offer to benchmark the threshold to a percentage of net assets/regulatory capital, or move to this tool's rating-linked mode so the amount tracks credit quality automatically.",
  },
  crossDefaultType: {
    pushback: "Counterparty resists the broader 'default or acceleration' trigger as capturing technical breaches.",
    counter: "Agree to narrow to default-only in exchange for tightening the Specified Entities definition.",
  },
  specifiedIndebtednessScope: {
    pushback: "A fund counterparty objects that its own repo/securities-lending financing — core to how it funds its portfolio — would itself constantly risk triggering cross default.",
    counter: "Carve out that financing, conditioned on a short payment-default cure period so a genuine default still counts.",
  },
  specifiedEntities: {
    pushback: "Counterparty objects to blanket inclusion of all present and future affiliates.",
    counter: "Move to a named, periodically-refreshed subsidiary list (or Credit Support Providers only) with a materiality/percentage-of-assets qualifier.",
  },
  ates: {
    pushback: "Buy-side counsel resists stacking multiple ATEs as giving the dealer a hair-trigger unwind right.",
    counter: "Retain the single most risk-relevant ATE (typically NAV decline) with a cure period, and drop the others.",
  },
  aet: {
    pushback: "Counterparty resists AET applying to it while the Dealer's own AET stays disapplied, calling it one-sided.",
    counter: "Explain AET on the Counterparty protects the Dealer from an automatic stay freezing close-out on the Counterparty's insolvency — offer AET on the Dealer too if the Counterparty faces the same stay risk on the Dealer's insolvency.",
  },
  processAgent: {
    pushback: "Counterparty proposes a lesser-known or affiliated process agent.",
    counter: "Insist on an established, independent corporate process agent with a proven service-of-process track record.",
  },
  csaStructure: {
    pushback: "Counterparty prefers title transfer over pledge (or vice versa) based on internal balance-sheet treatment.",
    counter: "Confirm both forms are viable under the chosen governing law and let the counterparty's balance-sheet preference decide, provided legal enforceability is unaffected.",
  },
  independentAmount: {
    pushback: "Counterparty views the IA as punitive, pre-funded margin unrelated to actual exposure.",
    counter: "Tie the IA to a ratings-linked grid so it scales with actual credit deterioration rather than a static amount.",
  },
  threshold: {
    pushback: "Counterparty argues a low threshold creates excessive day-to-day operational margining burden.",
    counter: "Offer a rating-linked threshold that starts higher but steps down automatically on downgrade, balancing operational ease against credit protection — this tool can model the effective amount directly.",
  },
  mta: {
    pushback: "Counterparty wants a very high MTA to minimize transfer frequency.",
    counter: "Hold to a standard market MTA and note that an excessive MTA reintroduces meaningful uncollateralized exposure.",
  },
  eligibleCollateral: {
    pushback: "Counterparty wants to post equities or less-liquid securities to reduce funding cost.",
    counter: "Accept a limited basket of liquid, government-quality collateral (including onshore government securities for domestic counterparties) with a defined haircut add-on for anything else.",
  },
  haircutLevel: {
    pushback: "Counterparty disputes a bespoke, dealer-set haircut schedule as opaque.",
    counter: "Move to the published ISDA/SIMM-aligned standard schedule, which is transparent and market-tested.",
  },
  concentrationLimits: {
    pushback: "Counterparty wants an uncapped basket to maximize which of its existing holdings it can post.",
    counter: "Offer standard 20%-per-issuer caps rather than no caps at all — protects against a concentrated, correlated collateral pool without excluding any single collateral type.",
  },
  interestRateCashCollateral: {
    pushback: "Counterparty flags a below-market spread on posted cash as an undisclosed funding subsidy to the dealer.",
    counter: "Move to the reference rate flat, or justify the spread by reference to the dealer's own documented funding cost.",
  },
  valuationAgent: {
    pushback: "Counterparty objects to a sole dealer Valuation Agent with no visibility into methodology.",
    counter: "Commit to disclosing the calculation methodology and add a Paragraph 5 dispute right, short of ceding sole Valuation Agent status.",
  },
  disputeResolutionTiming: {
    pushback: "Counterparty argues an extended dispute window leaves disputed margin calls unresolved too long.",
    counter: "Revert to the CSA-default 1 Local Business Day window, symmetric for both parties.",
  },
  demandMechanic: {
    pushback: "Counterparty argues an undated on-demand mechanic lets the Transferee time demands opportunistically.",
    counter: "Add a defined demand deadline and cutoff time so the mechanic remains predictable for both sides.",
  },
  distributionsElection: {
    pushback: "Counterparty objects to distributions on transferred securities being silently retained by the Transferee.",
    counter: "Elect Distributions passed back to the Transferor as the default, consistent with standard Title Transfer practice.",
  },
  custodianArrangement: {
    pushback: "Counterparty is uncomfortable with the Secured Party holding pledged collateral directly, with no independent custodian.",
    counter: "Move to a third-party custodian meeting objective Eligible Custodian criteria (rating, jurisdiction).",
  },
  rehypothecationRights: {
    pushback: "Counterparty resists unrestricted rehypothecation rights as increasing its return risk if the dealer defaults.",
    counter: "Offer rehypothecation subject to a recall right on notice, rather than eliminating the dealer's funding flexibility entirely.",
  },
  substitutionConsent: {
    pushback: "Counterparty argues sole-discretion substitution rights trap its ability to manage its own collateral pool.",
    counter: "Move to a consent standard — Secured Party approval required but not to be unreasonably withheld or delayed.",
  },
  imCalculationMethod: {
    pushback: "Counterparty lacks the governance/backtesting infrastructure to support SIMM.",
    counter: "Offer the Standardized Schedule as a fallback, accepting the more conservative (higher) IM number it produces.",
  },
  segregationStructure: {
    pushback: "Counterparty questions whether the proposed structure genuinely satisfies UMR's no-rehypothecation segregation mandate.",
    counter: "Confirm the account is a true third-party segregated account (or tri-party, if added oversight is wanted) with no rehypothecation rights.",
  },
  custodianApproval: {
    pushback: "Counterparty objects to the Secured Party unilaterally selecting the IM custodian.",
    counter: "Move to mutual consent over custodian selection and replacement, from a shortlist of established custodian banks.",
  },
  taxReps: {
    pushback: "Counterparty resists broad, open-ended tax representations.",
    counter: "Limit reps to FATCA (and 871(m) or local withholding regimes such as Indian Section 195 only if relevant), each qualified by knowledge and materiality.",
  },
  grossUp: {
    pushback: "Dealer resists gross-up as shifting withholding tax risk entirely onto it.",
    counter: "Limit gross-up strictly to Indemnifiable Taxes as defined in the ISDA definitions, excluding taxes caused by the payee's own non-compliance.",
  },
  documentsDelivered: {
    pushback: "Counterparty resists an open-ended 'such other documents as reasonably requested' obligation.",
    counter: "Enumerate the specific documents required (tax forms, authorizations, opinions) with a defined delivery timeline.",
  },
  calcAgent: {
    pushback: "Counterparty objects to the dealer acting as sole Calculation Agent on close-out valuation.",
    counter: "Add a dispute-resolution mechanism (e.g., reference market-maker quotations or a right to challenge with a second opinion) rather than switching to joint agency, which can create deadlock.",
  },
  sanctionsAML: {
    pushback: "Counterparty resists a broad sanctions clause it sees as an unlimited discretionary termination right.",
    counter: "Narrow the clause to representations tied to the counterparty's own status and conduct, not broader market events.",
  },
  setoff: {
    pushback: "Counterparty strongly resists broad, cross-affiliate, unmatured set-off as one-sided.",
    counter: "Offer reciprocal (mutual) set-off rights limited to matured obligations between the same two legal entities.",
  },
  illegalityFM: {
    pushback: "Counterparty wants a longer waiting period to preserve an economically important hedge before termination rights arise.",
    counter: "Agree to the ISDA 2002 standard 3 business day period as a market-tested middle ground.",
  },
  illegalityDesignationRight: {
    pushback: "Dealer wants sole control over designation to avoid the Counterparty timing termination to its own advantage during a volatile illegality/FM event.",
    counter: "Point out the printed-form default (either Affected Party designates) is the market-tested allocation; offer a shortened notice period instead of ceding designation control entirely.",
  },
  regulatoryOverlay: {
    pushback: "Counterparty (or its compliance team) disputes which regulatory overlay applies, especially for India onshore vs. GIFT City IFSC entities.",
    counter: "Request the counterparty's registration documentation (e.g., IFSCA registration certificate for GIFT City entities) to confirm regulatory status before finalizing the overlay election.",
  },
  femaCollateralApproval: {
    pushback: "Counterparty's treasury team is unsure whether general permission under the RBI Master Direction covers the proposed collateral flows.",
    counter: "Request written confirmation from the counterparty's compliance/treasury function, or hold collateral posting until specific RBI approval is confirmed rather than proceeding on an assumption.",
  },
  disputeResolution: {
    pushback: "Counterparty (often a sovereign or state-affiliated entity) wants arbitration or its home courts to avoid submitting to a foreign jurisdiction.",
    counter: "Offer LCIA/ICC arbitration seated in a neutral venue as a middle ground, or accept non-exclusive jurisdiction so neither side is locked out of its own courts.",
  },
  transferAssignment: {
    pushback: "Dealer wants to book Transactions to an Affiliate freely (e.g., for regulatory capital or resolution planning reasons) without seeking consent each time.",
    counter: "Permit transfer to a wholly-owned Affiliate that assumes the obligations and meets minimum creditworthiness, without requiring case-by-case consent.",
  },
  sovereignImmunityWaiver: {
    pushback: "Sovereign or state-affiliated counterparty's mandate prohibits any waiver of immunity as a matter of policy.",
    counter: "Offer the narrower waiver-of-suit-only structure with an execution carve-out for central bank reserves — this is standard even for sovereigns that won't waive immunity outright.",
  },
  bankruptcyCarveout: {
    pushback: "Dealer resists any carve-out to Bankruptcy as diluting a foundational, bright-line Event of Default.",
    counter: "Scope the carve-out narrowly to the counterparty's own regulated resolution regime or genuinely technical/non-payment events, leaving a real insolvency filing fully in scope.",
  },
  taxEventUponMerger: {
    pushback: "Counterparty argues Tax Event Upon Merger gives the Dealer a termination right tied to the Counterparty's own routine corporate actions.",
    counter: "Note it's a standard, symmetric, evenly-negotiated Termination Event available to both parties (unlike Credit Event Upon Merger) — the real ask is usually a longer burden-sharing negotiation period, not exclusion.",
  },
  creditEventUponMerger: {
    pushback: "Counterparty resists a one-sided Credit Event Upon Merger election as an unreciprocated termination right.",
    counter: "Agree to make it mutual, or narrow it to a defined creditworthiness-deterioration test rather than a bare merger trigger.",
  },
  terminationCurrency: {
    pushback: "Counterparty in a capital-controlled jurisdiction wants local-currency settlement.",
    counter: "Confirm local capital-control rules don't restrict cross-border payment of a close-out amount before agreeing to local-currency settlement.",
  },
  closeoutMethodology: {
    pushback: "Counterparty distrusts a single-party 'commercially reasonable' close-out determination without independent verification.",
    counter: "Add a dispute-resolution or second-quote mechanism to close-out amounts (see Calculation Agent) rather than switching to the less-used 1992 form.",
  },
  creditSupportProvider: {
    pushback: "The party being asked to obtain a parent guarantee lacks a creditworthy parent, or its parent won't agree to guarantee derivatives exposure.",
    counter: "Consider a lower-cost substitute (e.g., a standby letter of credit or increased Independent Amount) calibrated to the same credit gap the guarantee was meant to close.",
  },
  failureToPayGracePeriod: {
    pushback: "Dealer resists any carve-out to Failure to Pay/Deliver as diluting a core, bright-line Event of Default.",
    counter: "Keep the carve-out narrow (solely operational/administrative/technical causes, short cure window, notice-triggered) so it doesn't reach genuine liquidity or credit-driven non-payment.",
  },
  defaultInterestSpread: {
    pushback: "Counterparty objects to an asymmetric default-rate formula that costs it more than it would cost the Dealer.",
    counter: "Move to the same formula for both parties' overdue amounts, consistent with the ISDA definitions' default drafting.",
  },
  protocolAdherence: {
    pushback: "Counterparty hasn't adhered to a protocol the Dealer needs in place before trading can continue.",
    counter: "Request protocol adherence (or bilateral equivalent language) as a condition precedent to further trading, rather than proceeding on an unamended basis.",
  },
  resolutionStayRecognition: {
    pushback: "Counterparty resists broad contractual stay language as ceding its own close-out rights on the Dealer's resolution, beyond what regulation actually compels of it.",
    counter: "Scope the stay to the regulatory minimum genuinely applicable to the counterparty type, rather than the full protocol-wide stay language.",
  },
  confirmationMethod: {
    pushback: "A smaller counterparty lacks access to the Dealer's electronic confirmation platform.",
    counter: "Offer email or fax confirmation as a documented fallback method rather than requiring platform access.",
  },
  noticeMethodCloseout: {
    pushback: "Counterparty argues a strict 1992-style reading (excluding email) protects it from a hastily-sent, informal default notice.",
    counter: "Accept email as effective, but add a same-day confirmation requirement (e.g., a read receipt or acknowledging reply) for Section 5/6 notices specifically.",
  },
  escrowNonSimultaneous: {
    pushback: "Dealer resists the operational cost and complexity of an escrow mechanism for routine trading.",
    counter: "Limit the escrow requirement to Transaction types/currency pairs where genuine cross-timezone settlement risk exists, rather than all Transactions.",
  },
  confidentiality: {
    pushback: "Dealer resists a broad confidentiality clause that could restrict internal risk/compliance information sharing.",
    counter: "Add express carve-outs for internal risk management, affiliates, and regulatory disclosure rather than dropping the clause entirely.",
  },
  recordingConsent: {
    pushback: "Counterparty in a jurisdiction with strict wiretapping/privacy law resists blanket recording consent.",
    counter: "Narrow the consent to communications made for the purpose of agreeing Transactions, consistent with the underlying regulatory rationale.",
  },
  nonRelianceECP: {
    pushback: "Counterparty resists broad non-reliance language as overriding what it was actually told by the Dealer's salesperson.",
    counter: "Qualify the non-reliance representation so it doesn't override written, Transaction-specific communications.",
  },
  noAgencyRepresentation: {
    pushback: "An investment manager counterparty can't truthfully make an unqualified 'acting as principal' representation, since it trades on behalf of underlying fund clients.",
    counter: "Qualify the representation to state it as principal on behalf of the disclosed fund(s)/account(s) it manages, rather than deleting the representation entirely.",
  },
  fishOrCutBait: {
    pushback: "Dealer resists any deadline on designating an Early Termination Date, wanting to preserve optionality through market moves.",
    counter: "Note that open-ended designation rights create asymmetric optionality risk for the Counterparty and are increasingly resisted by buy-side counsel; propose a window long enough for considered decision-making (e.g., 20 business days) without being indefinite.",
  },
  mostFavoredNation: {
    pushback: "Dealer resists an MFN clause as operationally burdensome to certify across its full counterparty book.",
    counter: "Narrow to pricing-only MFN against a defined peer group, rather than a broad, all-terms MFN the Dealer can't practically monitor.",
  },
  portfolioCompression: {
    pushback: "Counterparty is wary of Transactions being unilaterally torn up/compressed in a way that changes its hedge population without notice.",
    counter: "Route compression through a standard multilateral protocol/service with defined eligibility rules, rather than unilateral Dealer discretion.",
  },
};

function generateDefenseGuide() {
  const rows = [];
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      if (!fieldVisible(f, STATE.config, cat)) return;
      const tmpl = DEFENSE_TEMPLATES[f.key] || { pushback: "Counterparty may resist this term as drafted.", counter: "Assess materiality and propose a calibrated fallback." };
      rows.push({
        category: PIECES[cat].label,
        piece: f.label,
        leanTag: fieldPieceLean(cat, f).css.replace("lean-", ""),
        currentPosition: fieldValueDisplay(cat, f),
        pushback: tmpl.pushback,
        counter: tmpl.counter,
      });
    });
  });
  return rows;
}

/* ---------------------------------------------------------------------- */
/* 9. OUTPUT MODAL RENDERING                                              */
/* ---------------------------------------------------------------------- */

function csvEscape(value) {
  const s = String(value == null ? "" : value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LEAN_TAG_LABELS = { dealer: "Dealer", buyside: "Buy-side", neutral: "Neutral", aggressive: "Aggressive" };

function currentScenarioLabel() {
  let name = "Blank configuration";
  if (STATE.presetId === "__imported__") {
    name = "Imported configuration";
  } else if (STATE.presetId && STATE.presetId.startsWith("custom:")) {
    const cs = loadCustomScenarios().find((c) => `custom:${c.id}` === STATE.presetId);
    name = cs ? cs.name : "Custom scenario";
  } else {
    const preset = PRESETS.find((p) => p.id === STATE.presetId);
    if (preset && preset.id !== "blank") name = preset.name;
  }
  const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return `Scenario: ${name} · Generated ${dateStr}`;
}

// Vanilla Mode and the Select Clauses filter behave differently across
// outputs BY DESIGN: Term Sheet / Compare mirror what's actually on the
// board, while the Schedule / Elections Summary always reflect the full
// negotiated position (including hidden/niche elections), because that's
// what a real Schedule has to do. Both halves of that split are intentional
// — this only surfaces which one is in effect, for whichever output the
// user is about to look at, so neither behavior is silently surprising.
function activeFilterNames() {
  const names = [];
  if (STATE.vanillaMode) names.push("Vanilla Mode");
  if (STATE.focusFields) names.push("the Select Clauses filter");
  return names;
}

function modeWarningHtml(kind) {
  const names = activeFilterNames();
  if (!names.length) return "";
  const list = englishList(names);
  const plural = names.length > 1;
  const body =
    kind === "ignoresFilters"
      ? `${list} ${plural ? "are" : "is"} on, but this document always reflects every structurally applicable election — including clauses currently hidden from the board. Turn ${
          plural ? "them" : "it"
        } off if you want the document to match exactly what's visible.`
      : `${list} ${plural ? "are" : "is"} on — only clauses currently visible on the board are compared here. A hidden clause that actually differs won't show up. Use the Schedule's "Redline against" option to compare everything, including hidden clauses.`;
  return `<div class="mode-warning"><strong>⚠ Heads up:</strong> ${body}</div>`;
}

function csaStructureMismatchWarningHtml(structureMismatch, structureALabel, structureBLabel, note) {
  if (!structureMismatch) return "";
  const trailingNote =
    note ||
    "See the Credit Support Annex section below for how the structure-specific elections are grouped separately.";
  return `<div class="mode-warning"><strong>⚠ Different CSA forms:</strong> the current configuration uses the ${structureALabel} CSA, and the comparison scenario uses the ${structureBLabel} CSA — these are structurally different documents. ${trailingNote}</div>`;
}

function resetOutputExtras() {
  const docxBtn = document.getElementById("outputDownloadDocx");
  docxBtn.classList.add("hidden");
  docxBtn.onclick = null;
  document.getElementById("scheduleRedlineRow").classList.add("hidden");
}

function showTextOutput(title, text) {
  document.getElementById("outputTitle").textContent = title;
  document.getElementById("outputSubtitle").textContent = currentScenarioLabel();
  const body = document.getElementById("outputBody");
  body.innerHTML = `<div class="output-content"></div>`;
  body.querySelector(".output-content").textContent = text;
  document.getElementById("outputOverlay").classList.remove("hidden");
  const overlay = document.getElementById("outputOverlay");
  overlay.dataset.copyText = text;
  overlay.dataset.downloadName = `${slugify(title)}.txt`;
  overlay.dataset.downloadMime = "text/plain";
  overlay.dataset.downloadContent = text;
  resetOutputExtras();
}

function showTableOutput(title, rows, columns) {
  document.getElementById("outputTitle").textContent = title;
  document.getElementById("outputSubtitle").textContent = currentScenarioLabel();
  const body = document.getElementById("outputBody");
  const table = document.createElement("table");
  table.className = "matrix";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${columns.map((c) => `<th>${c.header}</th>`).join("")}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  let lastCategory = null;
  rows.forEach((row) => {
    if (row.category !== lastCategory) {
      lastCategory = row.category;
      const sectionTr = document.createElement("tr");
      sectionTr.className = "matrix-section";
      sectionTr.innerHTML = `<td colspan="${columns.length}">${row.category}</td>`;
      tbody.appendChild(sectionTr);
    }
    const tr = document.createElement("tr");
    tr.innerHTML = columns
      .map((c) => {
        const toneClass = c.tone ? ` class="tone-${c.tone}"` : "";
        const badge = c.showLean ? `<span class="tag tag-${row.leanTag}">${LEAN_TAG_LABELS[row.leanTag] || "Neutral"}</span> ` : "";
        return `<td${toneClass}>${badge}${row[c.key]}</td>`;
      })
      .join("");
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.innerHTML = "";
  body.appendChild(table);
  document.getElementById("outputOverlay").classList.remove("hidden");

  // The Category column is dropped from the visual table (the section
  // header rows already convey it) but is kept in text/CSV exports since
  // there's no equivalent grouping once the data leaves the table.
  const exportColumns = [{ key: "category", header: "Category" }, ...columns];
  const plain = rows
    .map((r) => exportColumns.map((c) => `${c.header}: ${r[c.key]}`).join(" | "))
    .join("\n");
  const csv = [exportColumns.map((c) => csvEscape(c.header)).join(",")]
    .concat(rows.map((r) => exportColumns.map((c) => csvEscape(r[c.key])).join(",")))
    .join("\n");

  const overlay = document.getElementById("outputOverlay");
  overlay.dataset.copyText = `${title}\n\n${plain}`;
  overlay.dataset.downloadName = `${slugify(title)}.csv`;
  overlay.dataset.downloadMime = "text/csv";
  overlay.dataset.downloadContent = csv;
  resetOutputExtras();
}

/* ---------------------------------------------------------------------- */
/* 10. SCENARIO MANAGEMENT — presets, custom saves, import/export         */
/* ---------------------------------------------------------------------- */

function populatePresetSelect() {
  const select = document.getElementById("presetSelect");
  select.innerHTML = "";
  PRESETS.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    if (p.id === STATE.presetId) o.selected = true;
    select.appendChild(o);
  });

  const customScenarios = loadCustomScenarios();
  if (customScenarios.length) {
    const group = document.createElement("optgroup");
    group.label = "My Custom Scenarios";
    customScenarios.forEach((cs) => {
      const o = document.createElement("option");
      o.value = `custom:${cs.id}`;
      o.textContent = cs.name;
      if (STATE.presetId === `custom:${cs.id}`) o.selected = true;
      group.appendChild(o);
    });
    select.appendChild(group);
  }

  if (STATE.presetId === "__imported__") {
    const o = document.createElement("option");
    o.id = "importedOption";
    o.value = "__imported__";
    o.textContent = "— Imported configuration —";
    o.selected = true;
    select.appendChild(o);
  }
}

// Resolves any presetSelect value ("blank"/other preset id, "custom:<id>", or
// a bare custom scenario id) to a full {config, notes} pair. Shared by
// applyPreset (which also updates STATE) and the Compare feature (which
// doesn't — it just needs a config to diff against).
function resolveScenarioById(id) {
  if (id.startsWith("custom:")) {
    const customId = id.slice("custom:".length);
    const scenario = loadCustomScenarios().find((cs) => cs.id === customId);
    return scenario
      ? { config: mergeConfigWithDefaults(scenario.config), notes: scenario.notes ? JSON.parse(JSON.stringify(scenario.notes)) : buildDefaultNotes() }
      : { config: buildDefaultConfig(), notes: buildDefaultNotes() };
  }
  const preset = PRESETS.find((p) => p.id === id);
  return {
    config: !preset || !preset.config ? buildDefaultConfig() : mergeConfigWithDefaults(preset.config),
    notes: buildDefaultNotes(),
  };
}

function applyPreset(id) {
  if (id === "__imported__") {
    // Programmatic marker for an imported config — do not overwrite state.
    pushHistory();
    STATE.presetId = id;
    // Switching the board out from under an active practice session (or an
    // open Matter) breaks the premise of what's being scored/tracked — end
    // both rather than leave their bars pointing at something the board no
    // longer reflects.
    STATE.practice = null;
    STATE.activeMatterId = null;
    updatePracticeBar();
    updateMatterBar();
    renderAll();
    return;
  }

  pushHistory();
  const { config, notes } = resolveScenarioById(id);
  STATE.presetId = id;
  STATE.config = config;
  STATE.notes = notes;
  STATE.practice = null;
  STATE.activeMatterId = null;
  updatePracticeBar();
  updateMatterBar();
  renderAll();
}

function handleSaveScenario() {
  const name = window.prompt("Name this scenario (e.g., \"Acme Corp — draft 2\"):", "");
  if (!name || !name.trim()) return;
  const scenarios = loadCustomScenarios();
  const id = `cs_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  scenarios.push({
    id,
    name: name.trim(),
    config: JSON.parse(JSON.stringify(STATE.config)),
    notes: JSON.parse(JSON.stringify(STATE.notes || buildDefaultNotes())),
  });
  saveCustomScenarios(scenarios);
  STATE.presetId = `custom:${id}`;
  populatePresetSelect();
  saveState();
}

function handleExportJson() {
  const payload = {
    exportedFrom: "ISDA Master Agreement Jigsaw v3",
    presetId: STATE.presetId,
    config: STATE.config,
    notes: STATE.notes,
  };
  downloadBlob(`isda-jigsaw-config-${slugify(STATE.presetId)}.json`, "application/json", JSON.stringify(payload, null, 2));
}

function handleImportJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !parsed.config) throw new Error("Missing config");
      pushHistory();
      STATE.config = mergeConfigWithDefaults(parsed.config);
      STATE.notes = parsed.notes || buildDefaultNotes();
      STATE.presetId = "__imported__";
      // Same reasoning as applyPreset(): an imported config replaces the
      // board out from under any active practice session or open Matter —
      // end both rather than leave their bars pointing at something the
      // board no longer reflects.
      STATE.practice = null;
      STATE.activeMatterId = null;
      updatePracticeBar();
      updateMatterBar();
      populatePresetSelect();
      renderAll();
    } catch (e) {
      window.alert("Could not import this file — it doesn't look like a valid exported configuration.");
    }
  };
  reader.readAsText(file);
}

// "Import Comparison Scenario" (formerly "Import Playbook" — renamed in the
// UI to stop colliding with the unrelated "Saved Scenarios"/Matters feature
// and the "Guardrails" feature, both of which also involve importing a
// position) is just a named scenario someone else authored — e.g. a firm's
// standard negotiating position, built by configuring the board to that
// position and clicking "Export JSON". Importing one adds it to the same
// customScenarios list "Save As…" writes to (displayed as "Custom Scenarios"
// throughout the UI), so it shows up for free everywhere that list is
// already read (Scenario dropdown, Compare, Schedule Redline) — and, unlike
// "Import JSON", it does NOT touch the current board; it only adds a new
// comparison target to the library. Internal identifiers below (function
// name, the file's optional "playbookName" field, STATE/localStorage keys)
// keep the old "playbook" name for backward compatibility with already-
// exported files and existing localStorage data — only user-visible text
// changed.
function handleImportPlaybookFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !parsed.config) throw new Error("Missing config");
      const suggested = (parsed.playbookName || "").trim() || "Imported Scenario";
      const name = window.prompt('Name this scenario (e.g., "Acme Legal — Dealer Position"):', suggested);
      if (!name || !name.trim()) return;
      const scenarios = loadCustomScenarios();
      const id = `cs_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      scenarios.push({
        id,
        name: name.trim(),
        config: mergeConfigWithDefaults(parsed.config),
        notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : buildDefaultNotes(),
      });
      saveCustomScenarios(scenarios);
      populatePresetSelect();
      window.alert(`"${name.trim()}" is now available as a custom scenario in the Scenario dropdown, Compare, Schedule Redline, and Negotiation Scenarios — your current board is unchanged.`);
    } catch (e) {
      window.alert('Could not import this file — it doesn\'t look like a valid exported configuration (expects the same JSON shape "Export JSON" produces: a top-level "config" object, plus optional "notes" and "playbookName").');
    }
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------------------------- */
/* 10b. FOCUS MODE — pick exactly which clauses to show                   */
/* ---------------------------------------------------------------------- */

function allFieldKeys() {
  return CATEGORY_ORDER.flatMap((cat) => PIECES[cat].fields.map((f) => f.key));
}

function updateFocusButtonLabel() {
  const btn = document.getElementById("focusModeBtn");
  if (STATE.focusFields) {
    const total = allFieldKeys().length;
    btn.textContent = `Clauses: ${STATE.focusFields.length} of ${total} shown`;
    btn.classList.add("focus-active");
  } else {
    btn.textContent = "Select Clauses…";
    btn.classList.remove("focus-active");
  }
}

function openFocusModal() {
  const list = document.getElementById("focusFieldList");
  list.innerHTML = "";
  CATEGORY_ORDER.forEach((cat) => {
    const group = document.createElement("div");
    group.className = "focus-category-group";
    const heading = document.createElement("h4");
    heading.textContent = PIECES[cat].label;
    group.appendChild(heading);
    const fieldsWrap = document.createElement("div");
    fieldsWrap.className = "focus-category-fields";
    PIECES[cat].fields.forEach((field) => {
      const row = document.createElement("div");
      row.className = "focus-field-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = field.key;
      cb.id = `focus-${field.key}`;
      // First time opening (no custom filter saved yet), start from just the
      // basic/always-negotiated clauses (the same set Vanilla mode treats as
      // non-niche) rather than the full ~57-field list — much less
      // intimidating to a first-time user, who can still add more from here.
      cb.checked = STATE.focusFields ? STATE.focusFields.includes(field.key) : !field.niche;
      cb.className = "focus-field-input";
      const lbl = document.createElement("label");
      lbl.setAttribute("for", cb.id);
      lbl.textContent = field.label;
      row.appendChild(cb);
      row.appendChild(lbl);
      fieldsWrap.appendChild(row);
    });
    group.appendChild(fieldsWrap);
    list.appendChild(group);
  });
  document.getElementById("focusOverlay").classList.remove("hidden");
}

function closeFocusModal() {
  document.getElementById("focusOverlay").classList.add("hidden");
}

function applyFocusSelection() {
  const checked = Array.from(document.querySelectorAll(".focus-field-input"))
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  // Selecting literally everything is equivalent to no filter — treat it that
  // way so newly-added fields show up automatically instead of needing the
  // filter re-applied.
  STATE.focusFields = checked.length === allFieldKeys().length ? null : checked;
  closeFocusModal();
  updateFocusButtonLabel();
  renderAll();
}

/* ---------------------------------------------------------------------- */
/* 10c. TUTORIAL — short, fully-skippable first-run walkthrough           */
/* ---------------------------------------------------------------------- */

const TUTORIAL_SEEN_KEY = "isda-jigsaw-v3-tutorial-seen";

const TUTORIAL_STEPS = [
  {
    title: "Welcome",
    body: "This is a semi-parodical educational tool for exploring ISDA Master Agreement / CSA negotiation points — not legal advice, not a real negotiating position. Click Skip anytime to jump straight in.",
  },
  {
    title: "Start from a scenario",
    body: "Pick a preset (hedge fund, sovereign, corporate...) from the Scenario dropdown, or start Blank. The gauge above tracks whether your configuration leans dealer-favourable (blue) or buy-side-favourable (green).",
  },
  {
    title: "Tinker with clauses",
    body: "Click any card to edit it. Hover a card, or its small section badge, to see the relevant ISDA Master Agreement / CSA citation.",
  },
  {
    title: "Watch the Compatibility Engine",
    body: "As you change clauses, the panel below live-flags mismatches, aggressive combinations, and drafting notes worth knowing about.",
  },
  {
    title: "Simplify what you see",
    body: "New here? Turn on \"Vanilla ISDA + CSA only\" to hide niche customisations, or use \"Select Clauses…\" to pick exactly which ones you want to see and edit, everything else stays hidden but with default values.",
  },
  {
    title: "Undo, and compare",
    body: "Undo/Redo (top right) step back through your edits, scenario switches and imports. \"Compare…\" diffs your current configuration against any preset or custom scenario, clause by clause — it shows only rows that currently differ.",
  },
  {
    title: "One \"Import…\" button, four different things",
    body: "\"Import…\" opens a menu with four options that read the same kind of file but do very different things — pick carefully. \"Import JSON\" replaces your current board outright (this is the only one of the four that touches your board — Undo can bring it back). \"Import Comparison Scenario\" adds a single named position as a comparison target — it doesn't touch your board, but shows up in the Scenario dropdown, Compare, Schedule Redline, and Negotiation Scenarios. \"Import Guardrails\" also leaves your board alone, but adds a tiered rule set (a preferred value plus fallbacks per clause) that live-flags every card as you edit, once picked from the \"Guardrails\" dropdown. \"Import Favorability Ruleset\" also leaves your board alone, but overrides this tool's own dealer/buy-side/neutral judgment once picked from the \"Favorability\" dropdown. The Import screen itself spells out this same distinction before you choose a file.",
  },
  {
    title: "Generate outputs",
    body: "Below the board: a Term Sheet, Fallback Matrix, and Defense Guide for negotiation prep, plus an Elections Summary — a short, visual readout of only the clauses you've changed from the defaults. Each can be copied, downloaded, or printed to PDF.",
  },
  {
    title: "Draft the real thing",
    body: "\"Generate Schedule\" builds a full-form ISDA Schedule & CSA in language closely reflecting legal language from every applicable election, downloadable as Markdown or Word (.docx). Add party names and a date under \"Deal Details…\" first if you want them filled in rather than left as [BRACKETED PLACEHOLDERS]. Inside the Schedule output, \"Redline against\" shows it as a clause-by-clause redline versus any other scenario.",
  },
  {
    title: "Practice negotiating",
    body: "\"Negotiation Scenarios…\" picks a realistic counterparty and which side you're advising, then resets the board to blank so you can negotiate it yourself. \"Score My Negotiation\" compares your finished configuration against a researched market outcome for that scenario, clause by clause.",
  },
  {
    title: "See what actually breaks",
    body: "\"What Breaks?…\" takes your current board and traces a market/credit event — a third-party debt default, a failed margin call, a ratings downgrade — clause by clause, showing exactly which elections fire, which stay silent because nothing was negotiated to catch that case, and why.",
  },
  {
    title: "Track a live deal: Saved Scenarios",
    body: "\"Saved Scenarios…\" turns one deal into a named workspace with its own round history and closing checklist. Open a saved scenario to load its latest round onto the board; \"Save New Round\" versions your progress (\"Draft 1 → Draft 2 → ...\"), and \"History…\" auto-diffs each round against the one before it.",
  },
  {
    title: "Live guardrails from a tiered rule set",
    body: "\"Import…\" → \"Import Guardrails\" loads a rule set with a preferred position AND fallbacks per clause (not just one target value). Pick it from the \"Guardrails\" dropdown and every card is tagged live — Preferred, Fallback, or Outside Guardrails — as you configure the board, not just when you ask to be scored. \"Reset\" clears the active guardrail set along with the board.",
  },
  {
    title: "Whose judgment is the gauge using?",
    body: "This tool's dealer/buy-side/neutral tag on every clause is an editorial judgment, not a fact — reasonable practitioners weigh the same clause differently. \"Import…\" → \"Import Favorability Ruleset\" lets someone substitute their own view, per clause. Pick it from the \"Favorability\" dropdown and it actually changes the Risk Gauge score, board tags, and outputs for every clause it covers — not just how they're displayed. \"Reset\" clears it too.",
  },
  {
    title: "Redlines Word can actually accept or reject",
    body: "The Schedule redline's Word download now uses real tracked-change revisions — Word's Review pane shows them and can Accept/Reject each one, so the export is something you can actually exchange with opposing counsel, not just a read-only visual reference.",
  },
];

let tutorialStepIndex = 0;

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  document.getElementById("tutorialStepCount").textContent = `Step ${tutorialStepIndex + 1} of ${TUTORIAL_STEPS.length}`;
  document.getElementById("tutorialTitle").textContent = step.title;
  document.getElementById("tutorialBody").textContent = step.body;
  document.getElementById("tutorialDots").innerHTML = TUTORIAL_STEPS.map((_, i) => `<span class="${i === tutorialStepIndex ? "active" : ""}"></span>`).join("");
  document.getElementById("tutorialBack").style.visibility = tutorialStepIndex === 0 ? "hidden" : "visible";
  document.getElementById("tutorialNext").textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? "Got it" : "Next";
}

function openTutorial() {
  tutorialStepIndex = 0;
  renderTutorialStep();
  document.getElementById("tutorialOverlay").classList.remove("hidden");
}

function closeTutorial() {
  document.getElementById("tutorialOverlay").classList.add("hidden");
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
  } catch (e) {
    /* storage unavailable */
  }
}

/* ---------------------------------------------------------------------- */
/* 10d. UNDO / REDO — in-memory history over config + notes + presetId    */
/* ---------------------------------------------------------------------- */

const HISTORY_LIMIT = 50;
let undoStack = [];
let redoStack = [];

function snapshotState() {
  return {
    config: JSON.parse(JSON.stringify(STATE.config)),
    notes: JSON.parse(JSON.stringify(STATE.notes)),
    presetId: STATE.presetId,
    // Practice mode must travel with the config it was scoped to — otherwise
    // undoing/redoing across a startPractice() boundary leaves the practice
    // bar pointing at a scenario the board no longer reflects. Same
    // reasoning for which Matter (if any) the board belongs to.
    practice: STATE.practice ? { ...STATE.practice } : null,
    activeMatterId: STATE.activeMatterId || null,
  };
}

// Call BEFORE mutating STATE.config/notes/presetId — captures what's about to
// be overwritten so Undo can restore it. Any new edit invalidates the redo
// stack, same as a standard editor's undo/redo semantics.
function pushHistory() {
  undoStack.push(snapshotState());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function restoreSnapshot(snapshot) {
  STATE.config = snapshot.config;
  STATE.notes = snapshot.notes;
  STATE.presetId = snapshot.presetId;
  STATE.practice = snapshot.practice || null;
  STATE.activeMatterId = snapshot.activeMatterId || null;
  updatePracticeBar();
  updateMatterBar();
  populatePresetSelect();
  renderAll();
  updateHistoryButtons();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  restoreSnapshot(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  restoreSnapshot(redoStack.pop());
}

function updateHistoryButtons() {
  document.getElementById("undoBtn").disabled = !undoStack.length;
  document.getElementById("redoBtn").disabled = !redoStack.length;
}

/* ---------------------------------------------------------------------- */
/* 10e. COMPARE — diff the current configuration against a preset/scenario */
/* ---------------------------------------------------------------------- */

function populateCompareSelect() {
  const select = document.getElementById("compareTargetSelect");
  select.innerHTML = "";
  PRESETS.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    select.appendChild(o);
  });
  const customScenarios = loadCustomScenarios();
  if (customScenarios.length) {
    const group = document.createElement("optgroup");
    group.label = "My Custom Scenarios";
    customScenarios.forEach((cs) => {
      const o = document.createElement("option");
      o.value = `custom:${cs.id}`;
      o.textContent = cs.name;
      group.appendChild(o);
    });
    select.appendChild(group);
  }
  // Default to something other than the current scenario when possible, so
  // the first comparison shown isn't trivially "no differences."
  const firstDifferent = Array.from(select.options).find((o) => o.value !== STATE.presetId);
  if (firstDifferent) select.value = firstDifferent.value;
}

function generateDiff(configA, configB) {
  const rows = [];
  const structureMismatch = csaStructuresDiffer(configA, configB);
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      if (structureMismatch && CSA_STRUCTURE_SPECIFIC_KEYS.includes(f.key)) return;
      if (!fieldVisible(f, STATE.config, cat)) return;
      const valA = configA[cat][f.key];
      const valB = configB[cat][f.key];
      if (JSON.stringify(valA) === JSON.stringify(valB)) return;
      rows.push({
        category: PIECES[cat].label,
        piece: f.label,
        current: fieldValueDisplayFor(configA, cat, f),
        compare: fieldValueDisplayFor(configB, cat, f),
      });
    });
  });
  return rows;
}

function runComparison() {
  const targetId = document.getElementById("compareTargetSelect").value;
  const target = resolveScenarioById(targetId);
  const rows = generateDiff(STATE.config, target.config);
  const resultsEl = document.getElementById("compareResults");
  const warningHtml = modeWarningHtml("respectsFilters");
  const csaField = fieldOf("attachments", "csaStructure");
  const structureMismatch = csaStructuresDiffer(STATE.config, target.config);
  const structureWarningHtml = csaStructureMismatchWarningHtml(
    structureMismatch,
    csaField.options.find((o) => o.value === STATE.config.attachments.csaStructure)?.label || STATE.config.attachments.csaStructure,
    csaField.options.find((o) => o.value === target.config.attachments.csaStructure)?.label || target.config.attachments.csaStructure,
    "CSA-form-specific elections (custodian/rehypothecation/IM mechanics, etc.) aren't comparable across different forms and are excluded below — only the CSA structure election itself is compared."
  );
  if (!rows.length) {
    resultsEl.innerHTML = `${warningHtml}${structureWarningHtml}<p class="flags-empty">No differences — every visible clause matches this scenario.</p>`;
    return;
  }
  let lastCat = null;
  const body = rows
    .map((r) => {
      const header = r.category !== lastCat ? `<tr class="matrix-section"><td colspan="3">${r.category}</td></tr>` : "";
      lastCat = r.category;
      return `${header}<tr><td>${r.piece}</td><td>${r.current}</td><td>${r.compare}</td></tr>`;
    })
    .join("");
  resultsEl.innerHTML = `
    ${warningHtml}
    ${structureWarningHtml}
    <table class="matrix">
      <thead><tr><th>Piece</th><th>Current</th><th>Comparison</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function openCompareModal() {
  populateCompareSelect();
  runComparison();
  document.getElementById("compareOverlay").classList.remove("hidden");
}

/* ---------------------------------------------------------------------- */
/* 10f. NEGOTIATION SCENARIOS (practice mode)                             */
/* ---------------------------------------------------------------------- */
/* Reuses the 8 researched PRESETS as the "vetted market outcome" for each */
/* scenario, rather than inventing new negotiated positions — those       */
/* presets already carry citation-level detail (see their descriptions).  */
/* The user negotiates blind against a blank board, then is scored on how */
/* many structurally-applicable elections (conditionalMatch, same basis   */
/* as Schedule generation — this ignores Vanilla/Focus filters by design) */
/* match that outcome. There is deliberately no invented "correct"        */
/* position beyond what those presets already state.                     */

function practiceScenarios() {
  return PRESETS.filter((p) => p.id !== "blank");
}

function scenarioCounterpartyLabel(preset) {
  return preset.name.replace(/^\d+\.\s*Dealer vs\.\s*/, "");
}

// Resolves a practice target's display name/description whether it's one of
// the 8 researched PRESETS or a custom/imported scenario — the latter has no
// "N. Dealer vs. X" naming convention and no researched description, so it
// gets its own generic one rather than forcing the preset shape onto
// author-supplied content.
function practiceTargetLabel(id) {
  if (id.startsWith("custom:")) {
    const customId = id.slice("custom:".length);
    const cs = loadCustomScenarios().find((c) => c.id === customId);
    return {
      label: cs ? cs.name : "Imported scenario",
      isPreset: false,
      description:
        "A custom or imported scenario you added — reflects whatever position its author configured, not an independently researched market outcome.",
    };
  }
  const preset = PRESETS.find((p) => p.id === id);
  return { label: preset ? scenarioCounterpartyLabel(preset) : id, isPreset: true, description: preset ? preset.description : "" };
}

function populatePracticeScenarioList() {
  const list = document.getElementById("practiceScenarioList");
  const presetCards = practiceScenarios()
    .map((p) => {
      const cpLabel = scenarioCounterpartyLabel(p);
      return `
        <div class="practice-scenario-card">
          <h4>${cpLabel}</h4>
          <p>${p.description}</p>
          <div class="practice-scenario-actions">
            <button class="btn btn-ghost btn-sm" data-practice-start="${p.id}" data-practice-side="dealer">Practice as Dealer</button>
            <button class="btn btn-ghost btn-sm" data-practice-start="${p.id}" data-practice-side="counterparty">Practice as Counterparty</button>
          </div>
        </div>
      `;
    })
    .join("");
  const customScenarios = loadCustomScenarios();
  const customCards = customScenarios.length
    ? `<h4 class="practice-group-label">My Custom Scenarios</h4>` +
      customScenarios
        .map((cs) => {
          const id = `custom:${cs.id}`;
          return `
            <div class="practice-scenario-card">
              <h4>${cs.name}</h4>
              <p>Custom or imported scenario — scores against exactly the position saved/imported.</p>
              <div class="practice-scenario-actions">
                <button class="btn btn-ghost btn-sm" data-practice-start="${id}" data-practice-side="dealer">Practice as Dealer</button>
                <button class="btn btn-ghost btn-sm" data-practice-start="${id}" data-practice-side="counterparty">Practice as Counterparty</button>
              </div>
            </div>
          `;
        })
        .join("")
    : "";
  list.innerHTML = presetCards + customCards;
  list.querySelectorAll("[data-practice-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      startPractice(btn.getAttribute("data-practice-start"), btn.getAttribute("data-practice-side"));
    });
  });
}

function openPracticeModal() {
  populatePracticeScenarioList();
  document.getElementById("practiceOverlay").classList.remove("hidden");
}

function practiceMandateText() {
  if (!STATE.practice) return "";
  const target = practiceTargetLabel(STATE.practice.presetId);
  const sideLabel = STATE.practice.side === "dealer" ? "the Dealer" : "the Counterparty";
  const situation = target.isPreset ? `a Dealer vs. ${target.label} negotiation` : `the "${target.label}" scenario`;
  return (
    `You are advising ${sideLabel} in ${situation}. ${target.description} ` +
    `Configure the board with the terms you'd realistically push for and settle on, then use "Score My Negotiation" ` +
    `to see how your position compares${target.isPreset ? " to a researched, market-consistent outcome for this fact pattern" : " to this target"}.`
  );
}

function updatePracticeBar() {
  const bar = document.getElementById("practiceBar");
  if (!STATE.practice) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const target = practiceTargetLabel(STATE.practice.presetId);
  const sideLabel = STATE.practice.side === "dealer" ? "Dealer" : "Counterparty";
  document.getElementById("practiceBarLabel").textContent = `${target.label} — advising the ${sideLabel}`;
  document.getElementById("practiceMandateBtn").title = practiceMandateText();
}

function startPractice(presetId, side) {
  pushHistory();
  STATE.practice = { presetId, side };
  STATE.config = buildDefaultConfig();
  STATE.presetId = "blank";
  STATE.notes = buildDefaultNotes();
  // Practicing wipes the board to blank — an open Matter's board would
  // otherwise be silently discarded (recoverable via Undo, but the Matter
  // bar shouldn't keep claiming to track what's now a blank practice board).
  STATE.activeMatterId = null;
  updateMatterBar();
  document.getElementById("practiceOverlay").classList.add("hidden");
  document.getElementById("presetSelect").value = "blank";
  updatePracticeBar();
  renderAll();
}

function endPractice() {
  STATE.practice = null;
  updatePracticeBar();
}

// Structural basis matches Schedule/Summary generation (conditionalMatch,
// not fieldVisible) — a negotiation scorecard should reflect the whole
// negotiated position, not just whatever the board filters happen to show.
// Different CSA forms make their structure-specific elections categorically
// incomparable (see CSA_STRUCTURE_SPECIFIC_KEYS) — score/list only the CSA
// structure election itself in that case, not the leftover default values
// sitting under whichever form each side doesn't actually use. Otherwise a
// Pledge-only election could get scored as a "match" against an IM
// Bilateral target purely because both sides left it at its inert default.
// Basis for conditionalMatch is always the live board — see
// diffConfigsWithBasis (10h) for the general version used by Round History,
// which diffs two arbitrary saved rounds instead.
function generateFullDiff(configA, configB) {
  return diffConfigsWithBasis(configA, configB, STATE.config);
}

function scoreBand(pct) {
  if (pct >= 80) return "score-high";
  if (pct >= 50) return "score-mid";
  return "score-low";
}

function openPracticeScoreModal() {
  if (!STATE.practice) return;
  const target = practiceTargetLabel(STATE.practice.presetId);
  const targetConfig = resolveScenarioById(STATE.practice.presetId).config;
  const { rows, total, matched, structureMismatch } = generateFullDiff(STATE.config, targetConfig);
  const pct = total ? Math.round((matched / total) * 100) : 0;
  const warningHtml = modeWarningHtml("ignoresFilters");
  const csaField = fieldOf("attachments", "csaStructure");
  const structureWarningHtml = csaStructureMismatchWarningHtml(
    structureMismatch,
    csaField.options.find((o) => o.value === STATE.config.attachments.csaStructure)?.label || STATE.config.attachments.csaStructure,
    csaField.options.find((o) => o.value === targetConfig.attachments.csaStructure)?.label || targetConfig.attachments.csaStructure,
    "CSA-form-specific elections (custodian/rehypothecation/IM mechanics, etc.) aren't comparable across different forms and are excluded from the score below — only the CSA structure election itself counts."
  );

  const situation = target.isPreset ? `Dealer vs. ${target.label}` : target.label;
  const outcomeNoun = target.isPreset ? "researched market outcome" : "target position";
  document.getElementById("practiceScoreSubtitle").textContent =
    `${situation} — advising the ${STATE.practice.side === "dealer" ? "Dealer" : "Counterparty"}. Every structurally applicable election is scored, matching how the Schedule itself would read.`;

  let body = `${warningHtml}${structureWarningHtml}<div class="practice-score-summary ${scoreBand(pct)}"><span class="score-number">${pct}%</span><span>${matched} of ${total} negotiated positions match the ${outcomeNoun} for this scenario.</span></div>`;

  if (rows.length) {
    let lastCat = null;
    const tableBody = rows
      .map((r) => {
        const header = r.category !== lastCat ? `<tr class="matrix-section"><td colspan="3">${r.category}</td></tr>` : "";
        lastCat = r.category;
        return `${header}<tr><td>${r.piece}</td><td>${r.current}</td><td>${r.compare}</td></tr>`;
      })
      .join("");
    body += `
      <table class="matrix">
        <thead><tr><th>Piece</th><th>Your Position</th><th>${target.isPreset ? "Market Outcome for This Scenario" : "Target (Custom Scenario) Position"}</th></tr></thead>
        <tbody>${tableBody}</tbody>
      </table>
    `;
  } else {
    body += `<p class="flags-empty">Every applicable election matches the ${outcomeNoun} for this scenario.</p>`;
  }

  document.getElementById("practiceScoreResults").innerHTML = body;
  document.getElementById("practiceScoreOverlay").classList.remove("hidden");
}

/* ---------------------------------------------------------------------- */
/* 10g. WHAT BREAKS? — stress-test simulator                              */
/* ---------------------------------------------------------------------- */
/* Traces a market/credit event through the CURRENT board configuration,  */
/* clause by clause, citing the same ISDA_REFERENCES entries shown        */
/* elsewhere in the app. Every mechanic used here (Cross Default          */
/* carve-outs, AET, Close-out methodology, Failure to Pay/Deliver,        */
/* rating-linked Threshold scaling, the Additional-Termination-Event      */
/* placeholder nature of Section 5(b)(v)) is standard, well-established   */
/* ISDA doctrine already reflected in the PIECES data model and its       */
/* citations above — nothing here invents new legal claims. Anything      */
/* genuinely uncertain (e.g., precise designation-right mechanics on a    */
/* Credit Event Upon Merger) is deliberately left out rather than guessed */
/* at, per the instruction that accuracy matters more than coverage.      */

// Shared downstream chain once an Event of Default (EOD) or a Termination
// Event (TE) has occurred with `defaultingKey` ("a" = Dealer, "b" =
// Counterparty) as the (sole) Affected/Defaulting Party.
function closeoutChainSteps(config, defaultingKey, kind) {
  const steps = [];
  const defLabel = defaultingKey === "a" ? "Dealer" : "Counterparty";
  const nonDefKey = defaultingKey === "a" ? "b" : "a";
  const nonDefLabel = nonDefKey === "a" ? "Dealer" : "Counterparty";

  if (kind === "EOD") {
    steps.push({
      status: "fires",
      cite: "§6(a)",
      title: `All outstanding Transactions become terminable — not just the transaction connected to this event.`,
      detail: `Because this is an Event of Default (not merely a Termination Event), the ${nonDefLabel}, as Non-defaulting Party, may close out the entire portfolio under this Agreement.`,
    });
  } else {
    steps.push({
      status: "fires",
      cite: "§5(b)",
      title: `Only the Affected Transactions are subject to termination.`,
      detail: `Because this is a Termination Event with the ${defLabel} as sole Affected Party, the rest of the portfolio is unaffected by this event alone.`,
    });
  }

  const aetApplies = config.core.aet[defaultingKey] === "yes";
  if (aetApplies) {
    steps.push({
      status: "fires",
      cite: "§6(a)",
      title: `Automatic Early Termination applies to the ${defLabel} (Schedule Part 1(f)) — termination is immediate, not on notice.`,
      detail: `An Early Termination Date occurs automatically upon the ${kind === "EOD" ? "Event of Default" : "Termination Event"}, with no designation notice required from the ${nonDefLabel} — it can happen before the ${nonDefLabel} is even aware of it.`,
    });
  } else {
    steps.push({
      status: "info",
      cite: "§6(a)/6(b)",
      title: `The ${nonDefLabel} may designate an Early Termination Date on notice — nothing terminates automatically.`,
      detail: `Automatic Early Termination is disapplied to the ${defLabel} in this configuration. The Agreement and all Transactions continue in force until the ${nonDefLabel} actually serves a designation notice.`,
    });
  }

  const methodologyField = fieldOf("core", "closeoutMethodology");
  const methodOpt = methodologyField.options.find((o) => o.value === config.core.closeoutMethodology);
  const methodDetail = {
    closeOutAmount2002: `The ${nonDefLabel}, as Determining Party, calculates the Close-out Amount using commercially reasonable procedures — a good-faith standard, not unfettered discretion.`,
    marketQuotation1992: `The amount is anchored to quotes actually obtained from reference market-makers, which constrains (without eliminating) the determining party's discretion.`,
    loss1992: `The ${nonDefLabel} determines the amount owed based on its own reasonable, good-faith calculation of total losses/costs — the widest practical discretion of the three methodologies, and a frequent flashpoint if the ${nonDefLabel} is the Dealer.`,
  }[config.core.closeoutMethodology];
  steps.push({
    status: "info",
    cite: "§6(e)",
    title: `Close-out amount is determined under: ${methodOpt ? methodOpt.label : config.core.closeoutMethodology}.`,
    detail: methodDetail,
  });

  const terminationCurrencyField = fieldOf("core", "terminationCurrency");
  const tcOpt = terminationCurrencyField.options.find((o) => o.value === config.core.terminationCurrency);
  steps.push({
    status: "info",
    cite: "§6(e)",
    title: `Amounts are converted into and settled in the Termination Currency: ${tcOpt ? tcOpt.label : config.core.terminationCurrency}.`,
  });

  const thresholdVal = config.attachments.threshold;
  const mtaVal = config.attachments.mta;
  steps.push({
    status: "info",
    cite: "CSA ¶13",
    title: `Collateral already posted under the CSA is netted against the close-out amount.`,
    detail: `Threshold ${money(thresholdVal[defaultingKey])} / MTA ${money(mtaVal[defaultingKey])} governed how much uncollateralized exposure to the ${defLabel} was allowed to build up before this event — that gap becomes the ${nonDefLabel}'s uncollateralized loss at close-out.`,
  });

  if (config.inserts.setoff !== "none") {
    const broad = config.inserts.setoff === "broad";
    steps.push({
      status: "info",
      cite: broad ? "§6(f) / Part 5" : "§6(f)",
      title: `A ${broad ? "broad" : "narrow"} Set-Off election is in force.`,
      detail: broad
        ? `The ${nonDefLabel} may set off the close-out amount against other, unrelated amounts owed between the parties or their affiliates — broader than the printed-form default and a common negotiation flashpoint.`
        : `The ${nonDefLabel} may set off the close-out amount against other amounts already owed between the same two parties under this Agreement.`,
    });
  }

  return steps;
}

const STRESS_EVENTS = [
  {
    id: "crossDefault",
    name: "Counterparty defaults on outside debt (Cross Default)",
    blurb:
      "A third-party lender declares the Counterparty in payment default, or accelerates, on a loan/bond unrelated to this ISDA. Traces Section 5(a)(vi) using the current Specified Indebtedness carve-outs, trigger scope, and Threshold Amount.",
    inputs: [
      { key: "amount", label: "Amount of the defaulted/accelerated debt", type: "number", default: 20000000 },
      {
        key: "debtType",
        label: "What kind of debt is it?",
        type: "select",
        default: "bond",
        options: [
          { value: "bond", label: "Bond, term loan, or other ordinary borrowed money" },
          { value: "ordinary", label: "Ordinary-course bank deposit / cash management facility" },
          { value: "repo", label: "Repo / securities lending / portfolio margin financing" },
        ],
      },
      {
        key: "eventType",
        label: "What actually happened?",
        type: "select",
        default: "actualPaymentDefault",
        options: [
          { value: "actualPaymentDefault", label: "Actual payment default has occurred" },
          { value: "accelerationOnly", label: "Only become capable of being declared due (not yet defaulted/accelerated)" },
        ],
      },
    ],
    trace(config, inputs) {
      const steps = [];
      const scope = config.core.specifiedIndebtednessScope;
      let carvedOut = false;
      let carveoutNote = "";
      if (inputs.debtType === "ordinary" && scope !== "broad") {
        carvedOut = true;
        carveoutNote = "ordinary-course bank deposits are expressly carved out of \"Specified Indebtedness\" in this configuration";
      } else if (inputs.debtType === "repo" && scope === "fundFinancingCarveout") {
        carvedOut = true;
        carveoutNote =
          "repo/securities-lending/margin-financing entered into as portfolio financing is expressly carved out (subject to its own payment-default cure period) in this configuration";
      }

      if (carvedOut) {
        steps.push({
          status: "noFire",
          cite: "§14",
          title: `This debt does not count as "Specified Indebtedness" — nothing fires.`,
          detail: `${carveoutNote[0].toUpperCase()}${carveoutNote.slice(1)}, so this default cannot trigger Cross Default at all, regardless of amount.`,
        });
        return steps;
      }

      steps.push({
        status: "info",
        cite: "§14",
        title: `This debt counts as "Specified Indebtedness."`,
        detail: `No carve-out currently drafted into the Section 14 amendment excludes this type of debt.`,
      });

      if (config.core.crossDefaultType === "defaultOnly" && inputs.eventType === "accelerationOnly") {
        steps.push({
          status: "noFire",
          cite: "§5(a)(vi)",
          title: `Cross Default does not fire — this configuration only catches actual payment defaults.`,
          detail: `The debt has become capable of being accelerated but has not actually defaulted in payment and has not been accelerated. Because the negotiated trigger scope is "actual default only," mere accelerability doesn't count.`,
        });
        return steps;
      }

      const thresholdField = fieldOf("core", "crossDefaultThreshold");
      const eff = effectiveDual(thresholdField, config.core.crossDefaultThreshold);
      if (inputs.amount < eff.b) {
        steps.push({
          status: "noFire",
          cite: "§5(a)(vi)",
          title: `Below the Counterparty's Cross Default Threshold Amount (${money(eff.b)}) — nothing fires.`,
          detail: `The defaulted/accelerated debt of ${money(inputs.amount)} is below the negotiated Threshold Amount${
            config.core.crossDefaultThreshold.ratingLinked ? " (rating-adjusted for the Counterparty's current tier)" : ""
          }.`,
        });
        return steps;
      }

      steps.push({
        status: "fires",
        cite: "§5(a)(vi)",
        title: `Cross Default Event of Default occurs — ${money(inputs.amount)} exceeds the Counterparty's Threshold Amount of ${money(eff.b)}.`,
      });
      steps.push(...closeoutChainSteps(config, "b", "EOD"));
      return steps;
    },
  },
  {
    id: "marginFailure",
    name: "Counterparty fails to post required collateral (Margin Call Failure)",
    blurb:
      "The Counterparty's exposure exceeds its Threshold, a margin call is made, and the Counterparty fails to transfer the required Eligible Credit Support. Traces the CSA's Threshold/MTA mechanics into Section 5(a)(i).",
    inputs: [
      { key: "exposureAmount", label: "Counterparty's current mark-to-market exposure to the Dealer", type: "number", default: 20000000 },
      {
        key: "cured",
        label: "Was the failure a purely operational/administrative/technical error, cured within 5 Local Business Days of notice?",
        type: "select",
        default: "no",
        options: [
          { value: "no", label: "No — not cured (or not that kind of error)" },
          { value: "yes", label: "Yes — cured in time" },
        ],
      },
    ],
    trace(config, inputs) {
      const steps = [];
      const thresholdField = fieldOf("attachments", "threshold");
      const effThreshold = effectiveDual(thresholdField, config.attachments.threshold).b;
      const mtaVal = config.attachments.mta.b;
      const requiredTransfer = Math.max(0, inputs.exposureAmount - effThreshold);

      if (requiredTransfer < mtaVal) {
        steps.push({
          status: "noFire",
          cite: "CSA ¶13",
          title: `No transfer is actually required — nothing to fail to deliver.`,
          detail: `Exposure of ${money(inputs.exposureAmount)} less the Threshold of ${money(effThreshold)} leaves ${money(
            requiredTransfer
          )} of uncollateralized exposure, which is below the Minimum Transfer Amount of ${money(mtaVal)}. No margin call is triggered.`,
        });
        return steps;
      }

      steps.push({
        status: "info",
        cite: "CSA ¶13",
        title: `A margin call for ${money(requiredTransfer)} is triggered.`,
        detail: `Exposure of ${money(inputs.exposureAmount)} exceeds the Threshold of ${money(effThreshold)} by more than the Minimum Transfer Amount of ${money(mtaVal)}.`,
      });

      if (config.core.failureToPayGracePeriod === "operationalCarveout" && inputs.cured === "yes") {
        steps.push({
          status: "noFire",
          cite: "§5(a)(i) / Part 5",
          title: `Not an Event of Default — cured in time under the negotiated operational-error carve-out.`,
          detail: `This configuration carves out failures caused solely by an operational, administrative, or technical error, cured within 5 Local Business Days of written notice. Because the failure was cured within that window, no Event of Default occurs.`,
        });
        return steps;
      }

      steps.push({
        status: "fires",
        cite: "§5(a)(i)",
        title: `Failure to Pay or Deliver Event of Default occurs with respect to the Counterparty.`,
        detail:
          config.core.failureToPayGracePeriod === "operationalCarveout"
            ? `An operational-error carve-out exists in this configuration, but this failure wasn't cured within the 5 Local Business Day window (or wasn't a qualifying operational error) — so it still becomes an Event of Default.`
            : `The printed form treats any late transfer under the CSA (after the applicable Local Business Day grace period) as a Failure to Pay or Deliver — CSA transfer obligations are deemed obligations under the Agreement itself. No carve-out was negotiated here.`,
      });
      steps.push(...closeoutChainSteps(config, "b", "EOD"));
      return steps;
    },
  },
  {
    id: "downgrade",
    name: "Counterparty is downgraded by a rating agency",
    blurb:
      "Traces whether a ratings downgrade fires anything on its own (it only does if a Downgrade Trigger ATE was negotiated) and how it moves any rating-linked CSA Threshold or Cross Default Threshold.",
    inputs: [
      {
        key: "newRating",
        label: "Counterparty's new rating tier",
        type: "select",
        default: "bbb",
        options: RATING_TIERS.map((t) => ({ value: t.key, label: t.label })),
      },
    ],
    trace(config, inputs) {
      const steps = [];
      const ateFires = config.core.ates.includes("downgrade");
      if (ateFires) {
        steps.push({
          status: "fires",
          cite: "§5(b)(v)",
          title: `A Downgrade Additional Termination Event is triggered, assuming this crosses the level negotiated in Schedule Part 1(h).`,
          detail: `This configuration negotiated a Ratings Downgrade Trigger as an Additional Termination Event. The exact rating level that trips it is drafted into Part 1(h) and isn't modeled here — but once crossed, this fires as a Termination Event with the Counterparty as the (sole) Affected Party.`,
        });
        steps.push(...closeoutChainSteps(config, "b", "TE"));
      } else {
        steps.push({
          status: "noFire",
          cite: "§5(b)(v)",
          title: `No Additional Termination Event fires — a downgrade alone isn't a default or termination trigger under the printed ISDA form.`,
          detail: `This configuration did not negotiate a Ratings Downgrade Trigger. Section 5(b)(v) is a placeholder in the printed form — it only operates if a specific trigger was drafted into Part 1(h) of the Schedule. Nothing terminates automatically from a downgrade by itself.`,
        });
      }

      const newTier = ratingTier(inputs.newRating);
      const roundTo1000 = (n) => Math.round(n / 1000) * 1000;

      // This event is framed as a downgrade, but the input doesn't itself
      // restrict direction (the two rating-linked fields below can each
      // carry their own current counterparty rating, so there's no single
      // canonical "current rating" to validate against) — flag it plainly
      // when the selected tier is actually better than what's on the board,
      // rather than silently letting a "downgrade" scenario report a loosening.
      const referenceRatingField = config.attachments.threshold.ratingLinked
        ? config.attachments.threshold
        : config.core.crossDefaultThreshold.ratingLinked
        ? config.core.crossDefaultThreshold
        : null;
      if (referenceRatingField && ratingTierIndex(inputs.newRating) < ratingTierIndex(referenceRatingField.counterpartyRating)) {
        steps.push({
          status: "info",
          cite: "—",
          title: `Heads up: this is an upgrade, not a downgrade.`,
          detail: `${newTier.label} is better than the Counterparty's current rating (${ratingTier(referenceRatingField.counterpartyRating).label}) reflected on the board. The mechanical analysis below is still accurate for whichever direction you pick — pick a worse tier to model an actual downgrade.`,
        });
      }

      const thresholdField = fieldOf("attachments", "threshold");
      const thresholdVal = config.attachments.threshold;
      if (thresholdField.ratingLinkable && thresholdVal.ratingLinked) {
        const before = effectiveDual(thresholdField, thresholdVal).b;
        const after = roundTo1000(thresholdVal.b * newTier.multiplier);
        steps.push({
          status: after < before ? "fires" : "info",
          cite: "CSA ¶13",
          title: `The CSA Threshold for the Counterparty moves from ${money(before)} to ${money(after)} at ${newTier.label}.`,
          detail: `Threshold is rating-linked in this configuration, so collateral requirements tighten automatically as credit quality falls — without needing a separate default.`,
        });
      } else {
        steps.push({
          status: "info",
          cite: "CSA ¶13",
          title: `CSA Threshold does not move.`,
          detail: `Threshold is not rating-linked in this configuration, so a downgrade by itself doesn't change how much uncollateralized exposure the Counterparty may carry.`,
        });
      }

      const cdField = fieldOf("core", "crossDefaultThreshold");
      const cdVal = config.core.crossDefaultThreshold;
      if (cdField.ratingLinkable && cdVal.ratingLinked) {
        const before = effectiveDual(cdField, cdVal).b;
        const after = roundTo1000(cdVal.b * newTier.multiplier);
        steps.push({
          status: after < before ? "fires" : "info",
          cite: "§5(a)(vi)",
          title: `The Cross Default Threshold Amount for the Counterparty moves from ${money(before)} to ${money(after)} at ${newTier.label}.`,
          detail: `Cross Default's Threshold Amount is also rating-linked here — a smaller Threshold means a smaller third-party default is enough to trigger Cross Default going forward.`,
        });
      }

      return steps;
    },
  },
];

function populateStressEventSelect() {
  const select = document.getElementById("stressEventSelect");
  select.innerHTML = STRESS_EVENTS.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
}

function renderStressEventInputs() {
  const event = STRESS_EVENTS.find((e) => e.id === document.getElementById("stressEventSelect").value);
  document.getElementById("stressEventBlurb").textContent = event.blurb;
  const container = document.getElementById("stressEventInputs");
  container.innerHTML = event.inputs
    .map((inp) => {
      if (inp.type === "select") {
        return `
          <div class="field-group">
            <label>${inp.label}</label>
            <select data-stress-input="${inp.key}">
              ${inp.options.map((o) => `<option value="${o.value}" ${o.value === inp.default ? "selected" : ""}>${o.label}</option>`).join("")}
            </select>
          </div>
        `;
      }
      return `
        <div class="field-group">
          <label>${inp.label}</label>
          <input type="number" data-stress-input="${inp.key}" value="${inp.default}" step="1" min="0" />
        </div>
      `;
    })
    .join("");
  document.getElementById("stressResults").innerHTML = "";
}

function runStressTest() {
  const event = STRESS_EVENTS.find((e) => e.id === document.getElementById("stressEventSelect").value);
  const inputs = {};
  event.inputs.forEach((inp) => {
    const el = document.querySelector(`[data-stress-input="${inp.key}"]`);
    // Clamp: a native number input's `min` attribute doesn't stop a typed
    // negative value from being read, and a cleared/non-numeric field reads
    // back as "" (Number("") === 0, not NaN, so this is a floor, not a NaN
    // guard) — a negative monetary amount has no real-world meaning here.
    inputs[inp.key] = inp.type === "number" ? Math.max(0, Number(el.value) || 0) : el.value;
  });
  const steps = event.trace(STATE.config, inputs);
  const warningHtml = modeWarningHtml("ignoresFilters");
  const stepsHtml = steps
    .map(
      (s) => `
        <div class="stress-step stress-step-${s.status}">
          <div class="stress-step-title">${s.status === "fires" ? "⚡" : s.status === "noFire" ? "✓" : "ℹ"} ${s.title} <span class="stress-step-cite">${s.cite}</span></div>
          ${s.detail ? `<div>${s.detail}</div>` : ""}
        </div>
      `
    )
    .join("");
  document.getElementById("stressResults").innerHTML = `${warningHtml}${stepsHtml}`;
}

function openStressTestModal() {
  populateStressEventSelect();
  renderStressEventInputs();
  document.getElementById("stressTestOverlay").classList.remove("hidden");
}

/* ---------------------------------------------------------------------- */
/* 10h. MATTERS — multi-deal workspace, round history, closing checklist  */
/* ---------------------------------------------------------------------- */
/* A Matter wraps the existing single scratch board with a named, persistent */
/* identity: its own round history (versioned snapshots you explicitly save, */
/* not autosaved on every edit) and its own closing checklist. Opening a    */
/* Matter loads its latest round onto STATE.config/notes exactly the way a  */
/* preset does; "Save New Round" is the only thing that writes back.        */

const MATTER_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "underReview", label: "Under Review" },
  { value: "executed", label: "Executed" },
];

function loadMatters() {
  try {
    const raw = localStorage.getItem(MATTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveMatters(list) {
  try {
    localStorage.setItem(MATTERS_KEY, JSON.stringify(list));
  } catch (e) {
    /* storage unavailable */
  }
}

function findMatter(id) {
  return loadMatters().find((m) => m.id === id) || null;
}

function activeMatter() {
  return STATE.activeMatterId ? findMatter(STATE.activeMatterId) : null;
}

function createMatter(name, counterparty, targetCloseDate) {
  const matters = loadMatters();
  const id = `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const matter = {
    id,
    name,
    counterparty: counterparty || "",
    status: "draft",
    targetCloseDate: targetCloseDate || "",
    rounds: [
      {
        id: `r_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        label: "Round 1",
        timestamp: Date.now(),
        config: buildDefaultConfig(),
        notes: buildDefaultNotes(),
      },
    ],
    checklist: {},
  };
  matters.push(matter);
  saveMatters(matters);
  return matter;
}

function deleteMatter(matterId) {
  saveMatters(loadMatters().filter((m) => m.id !== matterId));
  if (STATE.activeMatterId === matterId) endMatterMode();
}

function updateMatterStatus(matterId, status) {
  const matters = loadMatters();
  const m = matters.find((mm) => mm.id === matterId);
  if (m) {
    m.status = status;
    saveMatters(matters);
  }
}

// Loads the given round of the given matter onto the board — ending Practice
// the same way applyPreset() already does, since the board is about to
// reflect something that mode's assumptions no longer hold for.
function loadMatterRound(matterId, roundIndex) {
  const matter = findMatter(matterId);
  if (!matter) return;
  const round = matter.rounds[roundIndex] != null ? matter.rounds[roundIndex] : matter.rounds[matter.rounds.length - 1];
  pushHistory();
  STATE.config = mergeConfigWithDefaults(round.config);
  STATE.notes = round.notes || buildDefaultNotes();
  STATE.presetId = "blank";
  STATE.practice = null;
  STATE.activeMatterId = matterId;
  document.getElementById("presetSelect").value = "blank";
  updatePracticeBar();
  updateMatterBar();
  renderAll();
}

function saveNewMatterRound(label) {
  const matter = activeMatter();
  if (!matter) return;
  const matters = loadMatters();
  const m = matters.find((mm) => mm.id === matter.id);
  if (!m) return;
  m.rounds.push({
    id: `r_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    label: label && label.trim() ? label.trim() : `Round ${m.rounds.length + 1}`,
    timestamp: Date.now(),
    config: JSON.parse(JSON.stringify(STATE.config)),
    notes: JSON.parse(JSON.stringify(STATE.notes || buildDefaultNotes())),
  });
  saveMatters(matters);
  updateMatterBar();
}

function endMatterMode() {
  STATE.activeMatterId = null;
  updateMatterBar();
}

function updateMatterBar() {
  const bar = document.getElementById("matterBar");
  const matter = activeMatter();
  if (!matter) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const statusLabel = (MATTER_STATUSES.find((s) => s.value === matter.status) || {}).label || matter.status;
  // Denominator is the board's CURRENT "Documents to be Delivered" election
  // (same set the checklist modal renders rows for) — not just whichever
  // entries happen to have been touched in matter.checklist, which would
  // otherwise undercount anything never clicked yet.
  const currentDocs = (STATE.config.edge && STATE.config.edge.documentsDelivered) || [];
  const checklist = matter.checklist || {};
  const receivedCount = currentDocs.filter((k) => checklist[k] && checklist[k].received).length;
  const checklistNote = currentDocs.length ? ` · Checklist ${receivedCount}/${currentDocs.length}` : "";
  document.getElementById("matterBarLabel").textContent =
    `${matter.name}${matter.counterparty ? " — " + matter.counterparty : ""} · Round ${matter.rounds.length} · ${statusLabel}${checklistNote}`;
}

function formatMatterDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function populateMattersList() {
  const matters = loadMatters();
  const list = document.getElementById("mattersList");
  if (!matters.length) {
    list.innerHTML = `<p class="matter-empty-note">No saved scenarios yet — create one above to start tracking a live deal's round history and closing checklist.</p>`;
    return;
  }
  list.innerHTML = matters
    .map((m) => {
      const statusLabel = (MATTER_STATUSES.find((s) => s.value === m.status) || {}).label || m.status;
      const statusOptions = MATTER_STATUSES.map((s) => `<option value="${s.value}" ${s.value === m.status ? "selected" : ""}>${s.label}</option>`).join("");
      return `
        <div class="matter-row" data-matter-id="${m.id}">
          <div class="matter-row-info">
            <h4>${m.name} <span class="status-pill status-${m.status}">${statusLabel}</span></h4>
            <div class="matter-row-meta">
              ${m.counterparty ? `<span>${m.counterparty}</span>` : ""}
              <span>${m.rounds.length} round${m.rounds.length === 1 ? "" : "s"}</span>
              ${m.targetCloseDate ? `<span>Target close: ${m.targetCloseDate}</span>` : ""}
            </div>
          </div>
          <div class="matter-row-actions">
            <select class="matter-status-select" data-matter-status="${m.id}">${statusOptions}</select>
            <button class="btn btn-ghost btn-sm" data-matter-open="${m.id}">Open</button>
            <button class="btn btn-ghost btn-sm" data-matter-delete="${m.id}">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll("[data-matter-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const matter = findMatter(btn.getAttribute("data-matter-open"));
      if (matter) loadMatterRound(matter.id, matter.rounds.length - 1);
      document.getElementById("mattersOverlay").classList.add("hidden");
    });
  });
  list.querySelectorAll("[data-matter-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-matter-delete");
      const matter = findMatter(id);
      if (matter && window.confirm(`Delete "${matter.name}" and all ${matter.rounds.length} of its saved rounds? This can't be undone.`)) {
        deleteMatter(id);
        populateMattersList();
      }
    });
  });
  list.querySelectorAll("[data-matter-status]").forEach((sel) => {
    sel.addEventListener("change", () => {
      updateMatterStatus(sel.getAttribute("data-matter-status"), sel.value);
      updateMatterBar();
    });
  });
}

function openMattersModal() {
  populateMattersList();
  document.getElementById("mattersOverlay").classList.remove("hidden");
}

function handleCreateMatter() {
  const nameInput = document.getElementById("newMatterName");
  const name = nameInput.value.trim();
  if (!name) {
    window.alert("Give the scenario a name first.");
    return;
  }
  const counterparty = document.getElementById("newMatterCounterparty").value.trim();
  const closeDate = document.getElementById("newMatterCloseDate").value;
  createMatter(name, counterparty, closeDate);
  nameInput.value = "";
  document.getElementById("newMatterCounterparty").value = "";
  document.getElementById("newMatterCloseDate").value = "";
  populateMattersList();
}

// General-purpose version of generateFullDiff's field-by-field comparison,
// parameterized on which config supplies the structural (conditionalMatch)
// basis. generateFullDiff always uses the live board for that; Round History
// diffs two arbitrary saved rounds, neither of which may be the current
// board, so it takes its own basis explicitly instead.
function diffConfigsWithBasis(configA, configB, basisConfig) {
  const rows = [];
  let total = 0;
  let matched = 0;
  const structureMismatch = csaStructuresDiffer(configA, configB);
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      if (structureMismatch && CSA_STRUCTURE_SPECIFIC_KEYS.includes(f.key)) return;
      if (!conditionalMatch(f, basisConfig, cat)) return;
      total++;
      const valA = configA[cat][f.key];
      const valB = configB[cat][f.key];
      if (JSON.stringify(valA) === JSON.stringify(valB)) {
        matched++;
        return;
      }
      rows.push({
        category: PIECES[cat].label,
        piece: f.label,
        current: fieldValueDisplayFor(configA, cat, f),
        compare: fieldValueDisplayFor(configB, cat, f),
      });
    });
  });
  return { rows, total, matched, structureMismatch };
}

function renderMatterDiffTable(diff) {
  if (!diff.rows.length) return `<p class="flags-empty">No differences from the previous round.</p>`;
  let lastCat = null;
  const body = diff.rows
    .map((r) => {
      const header = r.category !== lastCat ? `<tr class="matrix-section"><td colspan="3">${r.category}</td></tr>` : "";
      lastCat = r.category;
      return `${header}<tr><td>${r.piece}</td><td>${r.current}</td><td>${r.compare}</td></tr>`;
    })
    .join("");
  return `<table class="matrix"><thead><tr><th>Piece</th><th>Earlier Round</th><th>This Round</th></tr></thead><tbody>${body}</tbody></table>`;
}

// Auto-diffs every round against the one immediately before it — the
// baseline (Round 1) has nothing to diff against and is shown as such.
function openMatterHistoryModal() {
  const matter = activeMatter();
  if (!matter) return;
  document.getElementById("matterHistorySubtitle").textContent =
    `${matter.name} — ${matter.rounds.length} round${matter.rounds.length === 1 ? "" : "s"} saved. Click a round to see what changed since the one before it.`;
  const list = document.getElementById("matterHistoryList");
  list.innerHTML = matter.rounds
    .map((round, i) => {
      const prev = i > 0 ? matter.rounds[i - 1] : null;
      const roundConfig = mergeConfigWithDefaults(round.config);
      const diff = prev ? diffConfigsWithBasis(mergeConfigWithDefaults(prev.config), roundConfig, roundConfig) : null;
      const countBadge = prev ? `<span class="round-diff-count">${diff.rows.length} changed</span>` : `<span class="round-diff-count">baseline</span>`;
      return `
        <div class="round-card">
          <div class="round-card-header" data-round-toggle="${i}">
            <div>
              <div class="round-card-title">${round.label}</div>
              <div class="round-card-meta">${formatMatterDate(round.timestamp)}</div>
            </div>
            ${countBadge}
          </div>
          <div class="round-diff-table" id="round-diff-${i}">
            ${prev ? renderMatterDiffTable(diff) : `<p class="round-baseline-note">First saved round — nothing to diff against.</p>`}
          </div>
        </div>
      `;
    })
    .join("");
  list.querySelectorAll("[data-round-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      document.getElementById(`round-diff-${el.getAttribute("data-round-toggle")}`).classList.toggle("open");
    });
  });
  document.getElementById("matterHistoryOverlay").classList.remove("hidden");
}

// The checklist is built from whatever "Documents to be Delivered" currently
// elects on the board — status/due-date tracking persists on the Matter
// independent of which round is loaded (receiving a document doesn't stop
// being true just because an unrelated clause changes on the next round).
function setChecklistEntry(matterId, key, patch) {
  const matters = loadMatters();
  const m = matters.find((mm) => mm.id === matterId);
  if (!m) return;
  if (!m.checklist) m.checklist = {};
  const existing = m.checklist[key] || { received: false, dueDate: "" };
  m.checklist[key] = { ...existing, ...patch };
  saveMatters(matters);
  updateMatterBar();
}

function openMatterChecklistModal() {
  const matter = activeMatter();
  if (!matter) return;
  const docField = fieldOf("edge", "documentsDelivered");
  const selected = STATE.config.edge.documentsDelivered || [];
  const body = document.getElementById("matterChecklistBody");
  if (!selected.length) {
    body.innerHTML = `<p class="checklist-empty-note">No documents are currently elected under "Documents to be Delivered" (Edge category) — add some there first, then reopen the checklist.</p>`;
    document.getElementById("matterChecklistOverlay").classList.remove("hidden");
    return;
  }
  const todayStr = new Date().toDateString();
  const rows = selected
    .map((val) => {
      const opt = docField.options.find((o) => o.value === val);
      const entry = (matter.checklist && matter.checklist[val]) || { received: false, dueDate: "" };
      const overdue = entry.dueDate && !entry.received && new Date(entry.dueDate) < new Date(todayStr);
      return `
        <tr>
          <td>${opt ? opt.label : val}</td>
          <td><label class="checklist-received-label"><input type="checkbox" data-checklist-received="${val}" ${entry.received ? "checked" : ""}/> Received</label></td>
          <td><input type="date" data-checklist-due="${val}" value="${entry.dueDate || ""}" />${overdue ? ' <span class="checklist-overdue">overdue</span>' : ""}</td>
        </tr>
      `;
    })
    .join("");
  body.innerHTML = `<table class="checklist"><thead><tr><th>Document</th><th>Status</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table>`;
  body.querySelectorAll("[data-checklist-received]").forEach((cb) => {
    cb.addEventListener("change", () => {
      setChecklistEntry(matter.id, cb.getAttribute("data-checklist-received"), { received: cb.checked });
      openMatterChecklistModal();
    });
  });
  body.querySelectorAll("[data-checklist-due]").forEach((inp) => {
    inp.addEventListener("change", () => {
      setChecklistEntry(matter.id, inp.getAttribute("data-checklist-due"), { dueDate: inp.value });
      openMatterChecklistModal();
    });
  });
  document.getElementById("matterChecklistOverlay").classList.remove("hidden");
}

/* ---------------------------------------------------------------------- */
/* 10i. PLAYBOOK GUARDRAILS — tiered preferred/fallback positions, live    */
/*      on-board flagging (the "fuller" playbook tier beyond the flat,     */
/*      single-target Import Playbook feature in 10f)                    */
/* ---------------------------------------------------------------------- */
/* A guardrails file is EITHER the tiered shape:                          */
/*   { name, entries: { [cat]: { [fieldKey]: { preferred, fallbacks:[] } } } } */
/* OR the same flat { config: {...} } shape "Export JSON"/Import Playbook  */
/* already use — auto-upgraded here to { preferred: value, fallbacks: [] } */
/* per specified field, so an already-exported board doubles as a          */
/* preferred-only guardrail set with no separate authoring format to learn.*/

function loadPlaybooks() {
  try {
    const raw = localStorage.getItem(PLAYBOOKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePlaybooks(list) {
  try {
    localStorage.setItem(PLAYBOOKS_KEY, JSON.stringify(list));
  } catch (e) {
    /* storage unavailable */
  }
}

function findPlaybook(id) {
  return loadPlaybooks().find((p) => p.id === id) || null;
}

// Normalizes either accepted import shape into { [cat]: { [fieldKey]:
// { preferred, fallbacks } } }, dropping anything that isn't shape-compatible
// with the field it claims to govern (same defensive standard as
// mergeConfigWithDefaults, applied here since a guardrails file never flows
// through that function — it's a rules set, not a config).
function normalizeGuardrailEntries(parsed) {
  const entries = {};
  CATEGORY_ORDER.forEach((cat) => (entries[cat] = {}));
  const tiered = parsed && parsed.entries && typeof parsed.entries === "object" ? parsed.entries : null;
  const flatConfig = !tiered && parsed && parsed.config && typeof parsed.config === "object" ? parsed.config : null;
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      let preferred;
      let fallbacks = [];
      if (tiered && tiered[cat] && tiered[cat][f.key]) {
        const raw = tiered[cat][f.key];
        if (isCompatibleFieldValue(f, raw.preferred)) preferred = raw.preferred;
        if (Array.isArray(raw.fallbacks)) fallbacks = raw.fallbacks.filter((v) => isCompatibleFieldValue(f, v));
      } else if (flatConfig && flatConfig[cat] && isCompatibleFieldValue(f, flatConfig[cat][f.key])) {
        preferred = flatConfig[cat][f.key];
      }
      if (preferred !== undefined) entries[cat][f.key] = { preferred, fallbacks };
    });
  });
  return entries;
}

function handleImportGuardrailsFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const entries = normalizeGuardrailEntries(parsed);
      const covered = CATEGORY_ORDER.some((cat) => Object.keys(entries[cat]).length);
      if (!covered) throw new Error("No usable clauses found");
      const suggested = (parsed && parsed.name) || "";
      const name = window.prompt('Name this guardrail set (e.g., "Acme Legal — Dealer Guardrails"):', suggested);
      if (!name || !name.trim()) return;
      const playbooks = loadPlaybooks();
      const id = `pb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      playbooks.push({ id, name: name.trim(), entries });
      savePlaybooks(playbooks);
      populateGuardrailsSelect();
      document.getElementById("guardrailsSelect").value = id;
      STATE.playbookId = id;
      renderAll();
      window.alert(`"${name.trim()}" is now active — every card on the board is flagged preferred, an acceptable fallback, or outside the guardrails.`);
    } catch (e) {
      window.alert(
        'Could not import this file — expects either { "entries": { category: { fieldKey: { "preferred": value, "fallbacks": [...] } } } }, or the same JSON shape "Export JSON" produces.'
      );
    }
  };
  reader.readAsText(file);
}

function populateGuardrailsSelect() {
  const select = document.getElementById("guardrailsSelect");
  const current = STATE.playbookId || "";
  select.innerHTML = `<option value="">None</option>` + loadPlaybooks().map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  select.value = loadPlaybooks().some((p) => p.id === current) ? current : "";
}

// Status for one field given the active playbook's entry for it — undefined
// entry means the playbook simply doesn't cover this clause (not "outside").
function evaluateGuardrailField(playbook, cat, fieldKey, currentValue) {
  const entry = playbook.entries[cat] && playbook.entries[cat][fieldKey];
  if (!entry) return "notCovered";
  if (JSON.stringify(currentValue) === JSON.stringify(entry.preferred)) return "preferred";
  if ((entry.fallbacks || []).some((v) => JSON.stringify(v) === JSON.stringify(currentValue))) return "fallback";
  return "outside";
}

function activePlaybook() {
  return STATE.playbookId ? findPlaybook(STATE.playbookId) : null;
}

// Deliberately NOT called from applyPreset() itself — switching between
// scenarios (hedge fund, sovereign, a saved comparison target...) via the
// Scenario dropdown should leave an active guardrail set in place, since
// checking several draft positions against the same ruleset is exactly what
// it's for. "Reset" is different: it means start over completely, so it
// clears the guardrail selection too rather than leaving a stale ruleset
// flagging a now-blank board. Call this BEFORE applyPreset("blank") so the
// single renderAll() that follows already reflects the cleared selection.
function endGuardrails() {
  STATE.playbookId = null;
  const select = document.getElementById("guardrailsSelect");
  if (select) select.value = "";
}

// Tags every rendered piece-card with its guardrail status and refreshes the
// compliance summary strip. Called after renderQuadrants() on every render
// rather than folded into it, so the guardrails concept stays optional and
// additive to card rendering rather than entangled with it. Deliberately
// only counts/tags cards that are actually rendered right now — i.e. this
// respects Vanilla Mode/Focus filters the same way the board and Compare do
// (fieldVisible), unlike Schedule/Scorecard's "always the full position"
// convention. A live on-screen guardrail belongs with the "what you're
// looking at" bucket, not the "what a real Schedule must state" one.
function applyGuardrailTags() {
  const bar = document.getElementById("guardrailsBar");
  const playbook = activePlaybook();
  if (!playbook) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  let preferredCount = 0;
  let fallbackCount = 0;
  let outsideCount = 0;
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      if (f.type === "dualNumber" || f.type === "text") return; // no discrete "preferred value" concept for freeform/numeric fields
      const card = document.querySelector(`.piece-card[data-field-key="${f.key}"][data-field-cat="${cat}"]`);
      if (!card) return;
      const status = evaluateGuardrailField(playbook, cat, f.key, STATE.config[cat][f.key]);
      const existingTag = card.querySelector(".tag-guardrail");
      if (existingTag) existingTag.remove();
      if (status === "notCovered") return;
      if (status === "preferred") preferredCount++;
      else if (status === "fallback") fallbackCount++;
      else outsideCount++;
      const tagsWrap = card.querySelector(".piece-card-tags");
      if (!tagsWrap) return;
      const label = status === "preferred" ? "Preferred" : status === "fallback" ? "Fallback" : "Outside Guardrails";
      const span = document.createElement("span");
      span.className = `tag tag-guardrail tag-guardrail-${status}`;
      span.textContent = label;
      tagsWrap.appendChild(span);
    });
  });
  document.getElementById("guardrailsSummary").innerHTML =
    `<strong>${playbook.name}:</strong> ${preferredCount} preferred · ${fallbackCount} fallback · ${outsideCount} outside guardrails`;
}

/* ---------------------------------------------------------------------- */
/* 10j. FAVORABILITY RULESETS — let anyone override this tool's built-in  */
/*      dealer/buyside/neutral polarity per clause option, changing how   */
/*      the Risk Gauge, board card lean/tags, and Elections Summary/Term  */
/*      Sheet actually score every clause that carries an override.       */
/* ---------------------------------------------------------------------- */
/* This tool's classification of any clause option as dealer-favorable,   */
/* buy-side-favorable, or neutral is an editorial judgment, not a fact —   */
/* reasonable practitioners can weigh the same clause differently. A      */
/* favorability ruleset file lets someone encode their own judgment and   */
/* have it actually drive the app's scoring wherever it applies, rather   */
/* than merely being displayed alongside the built-in view.               */
/*                                                                        */
/* File shape:                                                            */
/*   { name, overrides: { [cat]: { [fieldKey]: { [optionValue]:          */
/*       "dealer" | "buyside" | "neutral"                                 */
/*       // OR, only for the one dualSelect field (Automatic Early        */
/*       // Termination, cat "core" / key "aet"):                         */
/*       // { favorsA: "dealer"|"buyside"|"neutral", favorsB: same }      */
/*   } } } }                                                               */
/* Coverage does not need to be total — any (cat, fieldKey, optionValue)  */
/* the file doesn't mention keeps this tool's built-in polarity for that  */
/* one option. Every scoring/rendering call site reads through            */
/* effectiveFavors()/effectiveFavorsSide() below rather than an option's  */
/* own .favors/.favorsA/.favorsB directly, so an active ruleset applies   */
/* uniformly to the Risk Gauge score, board card lean colors/tags, the    */
/* option-editor preview tag, and every output (Term Sheet, Elections     */
/* Summary, Fallback Matrix) that reads a card's lean via fieldPieceLean. */

function loadFavorabilityRulesets() {
  try {
    const raw = localStorage.getItem(FAVORABILITY_RULESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveFavorabilityRulesets(list) {
  try {
    localStorage.setItem(FAVORABILITY_RULESETS_KEY, JSON.stringify(list));
  } catch (e) {
    /* storage unavailable */
  }
}

function findFavorabilityRuleset(id) {
  return loadFavorabilityRulesets().find((r) => r.id === id) || null;
}

function activeFavorabilityRuleset() {
  return STATE.favorabilityRulesetId ? findFavorabilityRuleset(STATE.favorabilityRulesetId) : null;
}

const FAVORS_VALUES = ["dealer", "buyside", "neutral"];

// Normalizes an imported file into { [cat]: { [fieldKey]: { [optionValue]:
// favors | {favorsA, favorsB} } } }, dropping anything that doesn't
// correspond to a real category/field/option in PIECES, or whose value
// isn't one of the three allowed polarities — same defensive standard as
// normalizeGuardrailEntries, applied here for the same reason: this is a
// rules set that never flows through mergeConfigWithDefaults.
function normalizeFavorabilityOverrides(parsed) {
  const raw = parsed && parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : null;
  const overrides = {};
  if (!raw) return overrides;
  CATEGORY_ORDER.forEach((cat) => {
    if (!raw[cat] || typeof raw[cat] !== "object") return;
    PIECES[cat].fields.forEach((f) => {
      const fieldRaw = raw[cat][f.key];
      if (!fieldRaw || typeof fieldRaw !== "object" || !f.options) return;
      const fieldOverrides = {};
      f.options.forEach((opt) => {
        const entry = fieldRaw[opt.value];
        if (f.type === "dualSelect") {
          if (!entry || typeof entry !== "object") return;
          const favorsA = FAVORS_VALUES.includes(entry.favorsA) ? entry.favorsA : undefined;
          const favorsB = FAVORS_VALUES.includes(entry.favorsB) ? entry.favorsB : undefined;
          if (favorsA || favorsB) fieldOverrides[opt.value] = { favorsA, favorsB };
        } else if (FAVORS_VALUES.includes(entry)) {
          fieldOverrides[opt.value] = entry;
        }
      });
      if (Object.keys(fieldOverrides).length) {
        if (!overrides[cat]) overrides[cat] = {};
        overrides[cat][f.key] = fieldOverrides;
      }
    });
  });
  return overrides;
}

function handleImportFavorabilityFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const overrides = normalizeFavorabilityOverrides(parsed);
      const covered = Object.keys(overrides).some((cat) => Object.keys(overrides[cat]).length);
      if (!covered) throw new Error("No usable overrides found");
      const suggested = (parsed && parsed.name) || "";
      const name = window.prompt('Name this favorability ruleset (e.g., "Buy-side Counsel View"):', suggested);
      if (!name || !name.trim()) return;
      const rulesets = loadFavorabilityRulesets();
      const id = `fv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      rulesets.push({ id, name: name.trim(), overrides });
      saveFavorabilityRulesets(rulesets);
      populateFavorabilitySelect();
      document.getElementById("favorabilitySelect").value = id;
      STATE.favorabilityRulesetId = id;
      renderAll();
      window.alert(`"${name.trim()}" is now active — the Risk Gauge, board tags, and outputs use its polarity for every clause it covers.`);
    } catch (e) {
      window.alert(
        'Could not import this file — expects { "name": "...", "overrides": { category: { fieldKey: { optionValue: "dealer" | "buyside" | "neutral" } } } }, with { favorsA, favorsB } values only for the Automatic Early Termination field.'
      );
    }
  };
  reader.readAsText(file);
}

function populateFavorabilitySelect() {
  const select = document.getElementById("favorabilitySelect");
  const current = STATE.favorabilityRulesetId || "";
  select.innerHTML =
    `<option value="">Built-in</option>` + loadFavorabilityRulesets().map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
  select.value = loadFavorabilityRulesets().some((r) => r.id === current) ? current : "";
}

// Deliberately mirrors endGuardrails(): switching scenarios keeps a chosen
// favorability lens in place (checking several drafts through the same
// lens is exactly the point), but "Reset" means start over completely.
function endFavorabilityRuleset() {
  STATE.favorabilityRulesetId = null;
  const select = document.getElementById("favorabilitySelect");
  if (select) select.value = "";
}

// Effective polarity for one option under the active ruleset, falling back
// to the option's own built-in favors. Every call site below passes the
// option's own field so a ruleset with only partial coverage leaves
// everything it doesn't mention exactly as this tool ships it.
function effectiveFavors(cat, fieldKey, optionValue, builtIn) {
  const ruleset = activeFavorabilityRuleset();
  const entry = ruleset && ruleset.overrides[cat] && ruleset.overrides[cat][fieldKey] && ruleset.overrides[cat][fieldKey][optionValue];
  return typeof entry === "string" ? entry : builtIn;
}

// Same, for the one dualSelect field (Automatic Early Termination), whose
// two sides carry independent polarities under one option value.
function effectiveFavorsSide(cat, fieldKey, optionValue, side, builtIn) {
  const ruleset = activeFavorabilityRuleset();
  const entry = ruleset && ruleset.overrides[cat] && ruleset.overrides[cat][fieldKey] && ruleset.overrides[cat][fieldKey][optionValue];
  return entry && typeof entry === "object" && entry[side] ? entry[side] : builtIn;
}

// Count of currently-applicable overrides in the active ruleset — i.e. only
// overrides for the option value actually elected right now, matching what
// applyGuardrailTags does for guardrail coverage counts. Drives the
// favorabilityBar summary strip.
function countActiveFavorabilityOverrides() {
  const ruleset = activeFavorabilityRuleset();
  if (!ruleset) return 0;
  let count = 0;
  CATEGORY_ORDER.forEach((cat) => {
    PIECES[cat].fields.forEach((f) => {
      const val = STATE.config[cat][f.key];
      if (f.type === "select" && ruleset.overrides[cat]?.[f.key]?.[val] !== undefined) count++;
      else if (f.type === "multiselect" && Array.isArray(val)) {
        val.forEach((v) => {
          if (ruleset.overrides[cat]?.[f.key]?.[v] !== undefined) count++;
        });
      } else if (f.type === "dualSelect") {
        if (ruleset.overrides[cat]?.[f.key]?.[val.a]?.favorsA) count++;
        if (ruleset.overrides[cat]?.[f.key]?.[val.b]?.favorsB) count++;
      }
    });
  });
  return count;
}

function updateFavorabilityBar() {
  const bar = document.getElementById("favorabilityBar");
  const ruleset = activeFavorabilityRuleset();
  if (!ruleset) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const count = countActiveFavorabilityOverrides();
  document.getElementById("favorabilitySummary").innerHTML =
    `<strong>${ruleset.name}:</strong> overriding this tool's built-in dealer/buy-side view for ${count} elected clause${count === 1 ? "" : "s"} right now`;
}

/* ---------------------------------------------------------------------- */
/* 11. SCHEDULE / CSA DOCUMENT GENERATION — full-form legal drafting      */
/* ---------------------------------------------------------------------- */
/* Renders the complete negotiated position — every structurally          */
/* applicable election, including untouched defaults — as an original-    */
/* drafting ISDA Schedule and Credit Support Annex (Paragraph 13). This   */
/* deliberately ignores Vanilla mode / Focus mode (STATE.vanillaMode /    */
/* STATE.focusFields): those control what's shown on the interactive      */
/* board, but a real Schedule has to state every structurally applicable  */
/* election regardless of what the user happens to be looking at, so      */
/* inclusion here is driven by conditionalMatch() only, never fieldVisible.*/

function content(paragraphs, table) {
  const arr = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  return { paragraphs: arr.filter(Boolean), table: table || null };
}
function scheduleItem(heading, body) {
  return { refKey: slugify(heading), marker: null, heading, paragraphs: body.paragraphs, table: body.table };
}
function mapClause(map, val, fallback) {
  return (val != null && map[val]) || fallback || "No election made; the printed form applies unamended.";
}
// Free-text fields (Process Agent name, Deal Details party names) get
// interpolated into drafted clause text, which then flows through
// resolveCrossReferences' {{ref:...}} scan and the docx renderer's **bold**
// parsing. Without this, typing a name containing either sequence would get
// silently rewritten — e.g. a Dealer name of "Acme {{ref:set-off}}" would
// have that token resolved into an actual internal cross-reference. Breaking
// up both sequences with a zero-width-adjacent space keeps the text visually
// intact while making it impossible for either downstream pass to match it.
function sanitizeUserText(str) {
  return String(str || "")
    .replace(/\{\{/g, "{​{")
    .replace(/\}\}/g, "}​}")
    .replace(/\*\*/g, "*​*");
}
function optionLabel(field, value) {
  const o = field.options.find((o) => o.value === value);
  return o ? o.label : String(value);
}
function fieldOf(cat, key) {
  return PIECES[cat].fields.find((f) => f.key === key);
}
function englishList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
function dualAmountSentence(field, dv, defineTerm, sectionRef) {
  const eff = effectiveDual(field, dv);
  let s = `"${defineTerm}" means, for the purpose of ${sectionRef}, with respect to Dealer, ${money(dv.a)}, and with respect to Counterparty, ${money(dv.b)}, or the equivalent in another currency.`;
  if (field.ratingLinkable && dv.ratingLinked) {
    s += ` These are rating-linked anchor amounts (calibrated to an AA- counterparty); the amount actually in force scales at any time with the relevant party's then-current long-term senior unsecured debt rating. As of the date of this Schedule, the effective amount for Dealer (rated ${ratingTier(dv.dealerRating).label}) is ${money(eff.a)}, and for Counterparty (rated ${ratingTier(dv.counterpartyRating).label}) is ${money(eff.b)}.`;
  }
  return s;
}

/* --- Part 1: Termination Provisions ------------------------------------ */

const SPECIFIED_ENTITIES_TEXT = {
  none: "Not applicable, with respect to each party, for the purposes of Sections 5(a)(v), 5(a)(vi), 5(a)(vii), and 5(b)(v).",
  namedSubs:
    "With respect to each party, its Specified Entity for the purposes of Sections 5(a)(v), 5(a)(vi), 5(a)(vii), and 5(b)(v) is limited to those of its subsidiaries designated, by notice from time to time, as a material subsidiary; no other Affiliate is a Specified Entity.",
  csProvidersOnly:
    "With respect to each party, its Specified Entity for the purposes of Sections 5(a)(v), 5(a)(vi), 5(a)(vii), and 5(b)(v) is limited to any Credit Support Provider of that party under this Agreement.",
  allAffiliates:
    "With respect to each party, \"Specified Entity\" means, for the purposes of Sections 5(a)(v), 5(a)(vi), 5(a)(vii), and 5(b)(v), any Affiliate of that party, whether now existing or hereafter formed or acquired, without further notice or designation.",
};

const CROSS_DEFAULT_TYPE_TEXT = {
  defaultOnly:
    "\"Specified Indebtedness,\" as used in Section 5(a)(vi), is triggered only by an actual default in payment of the relevant indebtedness that has already become due and has not been paid, and not merely by indebtedness becoming capable of being declared due.",
  defaultOrAcceleration:
    "Section 5(a)(vi) applies as printed, without amendment: Cross Default is triggered where the relevant Specified Indebtedness either is not, when due (or within any applicable grace period), paid, or becomes capable of being declared due and payable before it would otherwise have been due and payable.",
};

const SPECIFIED_INDEBTEDNESS_TEXT = {
  broad: "\"Specified Indebtedness\" has the meaning specified in Section 14, without amendment.",
  standardBankingCarveout:
    "\"Specified Indebtedness\" has the meaning specified in Section 14, except that it does not include deposits received by a party in the ordinary course of its banking business.",
  fundFinancingCarveout:
    "\"Specified Indebtedness\" has the meaning specified in Section 14, except that it does not include (i) deposits received in the ordinary course of a party's banking business, and (ii) obligations under repurchase, reverse repurchase, securities lending, or margin financing transactions entered into by a party in the ordinary course of financing its investment portfolio, provided that, in the case of (ii), a failure to pay is not Specified Indebtedness for so long as it is cured within any applicable grace period under the relevant financing agreement.",
};

function crossDefaultItem(config) {
  const field = fieldOf("core", "crossDefaultThreshold");
  return scheduleItem("Cross Default",
    content([
      mapClause(CROSS_DEFAULT_TYPE_TEXT, config.core.crossDefaultType),
      mapClause(SPECIFIED_INDEBTEDNESS_TEXT, config.core.specifiedIndebtednessScope),
      dualAmountSentence(field, config.core.crossDefaultThreshold, "Threshold Amount", "Section 5(a)(vi)"),
    ])
  );
}

const CREDIT_EVENT_UPON_MERGER_TEXT = {
  notApplicable: "\"Credit Event Upon Merger,\" as defined in Section 5(b)(v), does not apply to either party.",
  bothParties: "\"Credit Event Upon Merger,\" as defined in Section 5(b)(v), applies to both parties.",
  counterpartyOnly: "\"Credit Event Upon Merger,\" as defined in Section 5(b)(v), applies to Counterparty only; it does not apply to Dealer.",
};

const AET_APPLIES_TEXT = "Automatic Early Termination will apply";
function aetItem(config) {
  const dv = config.core.aet;
  const line = (who, v) => (v === "yes" ? `${AET_APPLIES_TEXT} to ${who}.` : `Automatic Early Termination will not apply to ${who}.`);
  return scheduleItem("Automatic Early Termination", content(`${line("Dealer", dv.a)} ${line("Counterparty", dv.b)}`));
}

function processAgentClause(config) {
  const dv = config.core.aet;
  const required = dv.a === "yes" || dv.b === "yes";
  const name = sanitizeUserText((config.core.processAgent || "").trim());
  if (!required) return "No Process Agent is designated under Section 13(c); none is required given the parties' elections under {{ref:automatic-early-termination}} above.";
  if (name) return `For the purpose of Section 13(c), Dealer and Counterparty each appoints ${name} as its Process Agent to receive on its behalf service of process in any proceedings in connection with this Agreement.`;
  return "For the purpose of Section 13(c), a Process Agent has not yet been named, notwithstanding that Automatic Early Termination applies to at least one party under {{ref:automatic-early-termination}} above; a named Process Agent should be inserted before execution.";
}

const FAILURE_TO_PAY_TEXT = {
  none: "Section 5(a)(i) applies as printed, without amendment: any failure by a party, when due, to make a payment or delivery under this Agreement (not remedied within any applicable grace period after notice) is an Event of Default, without further carve-out.",
  operationalCarveout:
    "Section 5(a)(i) is amended to provide that a failure to pay or deliver caused solely by an administrative or operational error or omission (provided funds or the relevant asset were otherwise available to enable the payment or delivery when due) is not an Event of Default if remedied within five Local Business Days after the paying or delivering party receives written notice of the failure.",
};

const BANKRUPTCY_CARVEOUT_TEXT = {
  standardUnmodified: "Section 5(a)(vii) applies as printed, without amendment.",
  compressedGracePeriod:
    "Section 5(a)(vii) is amended so that, in each limb of that Section subject to a 30-day period following the institution of a proceeding or levy of execution, that period is reduced to 15 days.",
  regulatedEntityCarveout:
    "Section 5(a)(vii) is amended to provide that no Event of Default occurs under that Section by reason of (i) a party or its Credit Support Provider becoming subject to a special resolution, administration, or similar regime applicable to regulated banks or insurers, to the extent that action does not involve the entity's insolvency in the winding-up sense, or (ii) a technical, non-payment insolvency event affecting a regulated fund structure in connection with a solvent wind-down.",
};

const CLOSEOUT_METHODOLOGY_TEXT = {
  closeOutAmount2002:
    "The parties confirm the printed 2002 form: Section 6(e) applies on the basis of Close-out Amount, determined by the party or parties making the relevant determination in accordance with the Close-out Amount definition in Section 14, applying commercially reasonable procedures in good faith.",
  marketQuotation1992:
    "\"Market Quotation\" will apply, and the \"Second Method\" will apply, in each case as if the parties had entered into the 1992 ISDA Master Agreement and made those elections in this Schedule.",
  loss1992:
    "\"Loss\" will apply, and the \"Second Method\" will apply, in each case as if the parties had entered into the 1992 ISDA Master Agreement and made those elections in this Schedule, such that the non-defaulting (or non-Affected) party's own reasonable determination of its total losses and costs (or gain) governs the close-out calculation.",
};

const TERMINATION_CURRENCY_TEXT = {
  USD: "\"Termination Currency\" means United States Dollars.",
  EUR: "\"Termination Currency\" means Euro.",
  GBP: "\"Termination Currency\" means Pounds Sterling.",
  baseCurrency:
    "\"Termination Currency\" means the currency of the party to this Agreement with the greater aggregate exposure at the relevant time, as reasonably determined by the party making the determination under Section 6(e).",
};

const TAX_EVENT_UPON_MERGER_TEXT = {
  applicable: "\"Tax Event Upon Merger,\" as defined in Section 5(b)(iv), applies to both parties, unamended.",
  excluded:
    "\"Tax Event Upon Merger,\" as defined in Section 5(b)(iv), is amended so that a party's own action described in the \"X\" Merger definition does not give the other party a right to designate an Early Termination Date against it under that Section; each party's Tax Event Upon Merger right accordingly extends only to a Merger of the other party.",
};

const ATES_TEXT = {
  navDecline:
    "a NAV Decline Trigger — an Additional Termination Event, with Counterparty as the sole Affected Party, if the net asset value of Counterparty (or the relevant fund) declines by more than a percentage to be agreed, measured over a trailing period to be agreed",
  keyPerson:
    "a Key Person Event — an Additional Termination Event, with Counterparty as the sole Affected Party, if a Key Person (to be named) ceases to be actively involved in the management of Counterparty's investment activities and no replacement reasonably acceptable to Dealer is appointed within a period to be agreed",
  downgrade:
    "a Ratings Downgrade Trigger — an Additional Termination Event, with Counterparty as the sole Affected Party, if the long-term senior unsecured debt rating of Counterparty (or its Credit Support Provider) is downgraded below a level to be agreed by any Rating Agency",
};
function atesItem(config) {
  const vals = config.core.ates || [];
  if (!vals.length) {
    return scheduleItem("Additional Termination Event(s)", content("No Additional Termination Event is elected beyond those, if any, otherwise stated in this Schedule or a Confirmation."));
  }
  return scheduleItem("Additional Termination Event(s)",
    content(`For the purpose of Section 5(b)(vi), the following each constitute an Additional Termination Event: ${englishList(vals.map((v) => ATES_TEXT[v] || v))}.`)
  );
}

const ILLEGALITY_FM_TEXT = {
  0: "The Waiting Period for the purposes of Section 5(b)(i) (Illegality) and 5(b)(ii) (Force Majeure Event) is deemed to be zero days: the Affected Party may designate an Early Termination Date immediately, subject to the other conditions of Section 6(b).",
  3: "The Waiting Period for the purposes of Section 5(b)(i) (Illegality) and 5(b)(ii) (Force Majeure Event) is three Local Business Days (or Local Delivery Days, as applicable), as printed.",
  8: "The Waiting Period for the purposes of Section 5(b)(i) (Illegality) and 5(b)(ii) (Force Majeure Event) is extended to eight Local Business Days (or Local Delivery Days, as applicable).",
};
const ILLEGALITY_DESIGNATION_TEXT = {
  eitherAffectedPartyDesignates:
    "Section 6(b)(iv) applies as printed: either Affected Party may designate an Early Termination Date in respect of all Affected Transactions, following the procedure in that Section.",
  nonAffectedPartyControls:
    "Section 6(b)(iv) is amended so that, where there are two Affected Parties, or one Affected Party and one Non-affected Party, only the Non-affected Party (or, if both are Affected Parties, the party specified by agreement) may designate the Early Termination Date and select the Affected Transactions to be terminated.",
};

function buildPart1(config) {
  return {
    number: 1,
    title: "Termination Provisions",
    items: [
      scheduleItem("Specified Entity", content(mapClause(SPECIFIED_ENTITIES_TEXT, config.core.specifiedEntities))),
      scheduleItem("Specified Transaction", content("\"Specified Transaction\" will have the meaning specified in Section 14, unamended.")),
      crossDefaultItem(config),
      scheduleItem("Credit Event Upon Merger", content(mapClause(CREDIT_EVENT_UPON_MERGER_TEXT, config.core.creditEventUponMerger))),
      aetItem(config),
      scheduleItem("Failure to Pay or Deliver", content(mapClause(FAILURE_TO_PAY_TEXT, config.core.failureToPayGracePeriod))),
      scheduleItem("Bankruptcy", content(mapClause(BANKRUPTCY_CARVEOUT_TEXT, config.core.bankruptcyCarveout))),
      scheduleItem("Payments on Early Termination", content(mapClause(CLOSEOUT_METHODOLOGY_TEXT, config.core.closeoutMethodology))),
      scheduleItem("Termination Currency", content(mapClause(TERMINATION_CURRENCY_TEXT, config.core.terminationCurrency))),
      scheduleItem("Tax Event Upon Merger", content(mapClause(TAX_EVENT_UPON_MERGER_TEXT, config.core.taxEventUponMerger))),
      atesItem(config),
      scheduleItem("Illegality and Force Majeure",
        content([mapClause(ILLEGALITY_FM_TEXT, config.inserts.illegalityFM), mapClause(ILLEGALITY_DESIGNATION_TEXT, config.inserts.illegalityDesignationRight)])
      ),
    ],
  };
}

/* --- Part 2: Tax Representations --------------------------------------- */

const TAXREPS_TEXT = {
  fatca: "FATCA representations (Sections 1471–1474 of the U.S. Internal Revenue Code and the regulations thereunder)",
  s871m: "Section 871(m) representations (U.S. Internal Revenue Code and the regulations thereunder)",
  s195India: "Indian withholding tax representations under Section 195 of the Income-tax Act, 1961, including reliance (if any) on an applicable DTAA",
};
const GROSS_UP_TEXT = {
  yes: "\"X\" as used in Section 2(d)(i)(4) is specified to be Payer, such that each party will pay to the other such additional amount as is necessary to ensure that the net amount actually received by the other party (free and clear of Indemnifiable Taxes) equals the amount it would have received had no such Tax been required to be withheld or deducted.",
  no: "\"X\" as used in Section 2(d)(i)(4) is specified to be Payee: no gross-up obligation applies, and each payment is made subject to any required withholding or deduction for Indemnifiable Tax, without an additional amount.",
};
function buildPart2(config) {
  const vals = config.edge.taxReps || [];
  const taxRepsText = vals.length
    ? `In addition to Section 3(f) as printed, each party makes the following representations: ${englishList(vals.map((v) => TAXREPS_TEXT[v] || v))}.`
    : "No Tax Representations beyond Section 3(f) as printed are added.";
  return {
    number: 2,
    title: "Tax Representations",
    items: [
      scheduleItem("Payer / Payee Tax Representations", content(taxRepsText)),
      scheduleItem("Withholding Tax Gross-Up", content(mapClause(GROSS_UP_TEXT, config.edge.grossUp))),
    ],
  };
}

/* --- Part 3: Agreement to Deliver Documents ----------------------------- */

const DOCUMENTS_TABLE_TEXT = {
  taxForms: ["Tax forms (e.g., IRS Form W-8 or W-9, as applicable)", "Upon execution, and promptly upon any change in circumstances or expiry"],
  boardRes: ["Certified copies of board or other internal authorization resolutions", "Upon execution of this Agreement"],
  legalOpinion: ["Opinion of counsel addressing due authorization, execution, and enforceability", "Upon execution of this Agreement"],
  csDocs: ["Any Credit Support Document required under {{ref:credit-support-document}} below", "Upon execution of this Agreement"],
  processAgentLetter: ["Letter from the Process Agent named in {{ref:process-agent}} accepting its appointment", "Upon execution of this Agreement"],
  financialStatements: ["Annual audited financial statements and periodic NAV statements (if applicable)", "Promptly upon request, and in any event annually / at each periodic reporting date"],
};
function buildPart3(config) {
  const field = fieldOf("edge", "documentsDelivered");
  const vals = config.edge.documentsDelivered || [];
  if (!vals.length) {
    return {
      number: 3,
      title: "Agreement to Deliver Documents",
      items: [scheduleItem("Documents to be Delivered", content("No documents are separately elected beyond those otherwise required by Section 4(a)."))],
    };
  }
  const rows = vals.map((v) => {
    const [doc, by] = DOCUMENTS_TABLE_TEXT[v] || [optionLabel(field, v), "Upon execution of this Agreement"];
    return ["Each party", doc, by, "Yes"];
  });
  return {
    number: 3,
    title: "Agreement to Deliver Documents",
    items: [
      scheduleItem("Documents to be Delivered",
        content(
          "For the purpose of Section 4(a), each party agrees to deliver the following documents, each of which is covered by the representation in Section 3(d):",
          { headers: ["Party required to deliver", "Form / Document", "Date by which to be delivered", "Covered by 3(d) rep?"], rows }
        )
      ),
    ],
  };
}

/* --- Part 4: Miscellaneous ---------------------------------------------- */

const NOTICE_METHOD_TEXT = {
  emailValidForAll:
    "For the purpose of Section 12, email is an effective method of delivery for all notices under this Agreement, including notices of an Event of Default, a Potential Event of Default, and a designation of an Early Termination Date under Sections 5 and 6.",
  emailExcludedForCloseout:
    "For the purpose of Section 12, email is an effective method of delivery for routine notices, but is expressly excluded as an effective method for a notice of an Event of Default or a designation of an Early Termination Date under Sections 5 or 6, which must instead be delivered by hand, by facsimile, or by telex.",
};
const CONFIRMATION_METHOD_TEXT = {
  electronicPlatform:
    "For the purpose of Section 9(e), Transactions are confirmed through an agreed electronic confirmation platform or electronic messaging system, which constitutes a Confirmation for all purposes of this Agreement.",
  paper: "For the purpose of Section 9(e), Transactions are confirmed by an exchange of signed paper Confirmations (including by facsimile or scanned email attachment).",
};
const MULTIBRANCH_TEXT = {
  yes: "Dealer is a Multibranch Party for the purposes of Section 10(a) and may enter into a Transaction through any of its Offices, subject to Section 10(b). Counterparty is not a Multibranch Party.",
  no: "Neither party is a Multibranch Party for the purposes of Section 10(a); each party will enter into every Transaction through its head or home office only.",
};
const CALC_AGENT_TEXT = {
  dealerSole: "Dealer is the Calculation Agent for all purposes of this Agreement.",
  counterpartySole: "Counterparty is the Calculation Agent for all purposes of this Agreement.",
  joint:
    "Dealer and Counterparty are joint Calculation Agents; if they are unable to agree on a calculation or determination within a reasonable time, it will be referred to a mutually acceptable independent third party, whose determination is binding absent manifest error.",
  thirdParty: "[Independent third-party agent, to be named] is the Calculation Agent for all purposes of this Agreement.",
};
const CREDIT_SUPPORT_PROVIDER_TEXT = {
  none: "No Credit Support Provider is designated for either party.",
  dealerGuarantorOnly: "\"Credit Support Provider\" means, in relation to Dealer, [Dealer's parent/guarantor entity — to be named]; and, in relation to Counterparty, Not Applicable.",
  counterpartyGuarantorOnly: "\"Credit Support Provider\" means, in relation to Counterparty, [Counterparty's parent/guarantor entity — to be named]; and, in relation to Dealer, Not Applicable.",
  mutualGuarantees:
    "\"Credit Support Provider\" means, in relation to Dealer, [Dealer's guarantor entity — to be named], and, in relation to Counterparty, [Counterparty's guarantor entity — to be named], each of which will execute and deliver a guarantee in favor of the other party's Credit Support Provider (or, absent one, the other party) substantially concurrently with this Agreement.",
};
const CREDIT_SUPPORT_DOCUMENT_TEXT = {
  vmTitleTransferEnglish:
    "\"Credit Support Document\" means the Credit Support Annex (1995 ISDA, Transfer — English law) between the parties, forming part of this Agreement, the elections for which are set out in the Credit Support Annex below.",
  vmPledgeNY:
    "\"Credit Support Document\" means the Credit Support Annex (1994 ISDA, Bilateral Form — New York law) between the parties, forming part of this Agreement, the elections for which are set out in the Credit Support Annex below.",
  vmImBilateral:
    "\"Credit Support Document\" means, collectively, the Variation Margin Credit Support Annex and the Initial Margin Credit Support Annex between the parties, forming part of this Agreement, the elections for which are set out in the Credit Support Annex below.",
};
const GOVERNING_LAW_TEXT = {
  NY: "This Agreement, and each Confirmation, is governed by, and construed in accordance with, the laws of the State of New York (without reference to choice of law doctrine, other than Section 5-1401 of the New York General Obligations Law).",
  English: "This Agreement, and each Confirmation, is governed by, and construed in accordance with, the laws of England and Wales.",
  Irish: "This Agreement, and each Confirmation, is governed by, and construed in accordance with, the laws of Ireland.",
  French:
    "This Agreement, and each Confirmation, is governed by, and construed in accordance with, the laws of France, and is intended to constitute a \"contrat-cadre\" benefiting from the netting protections of Articles L.211-36 et seq. of the French Monetary and Financial Code, consistent with the FBF/ISDA-compatible master agreement framework.",
  Japanese: "This Agreement, and each Confirmation, is governed by, and construed in accordance with, the laws of Japan.",
  Indian:
    "This Agreement, and each Confirmation, is governed by, and construed in accordance with, the laws of the Republic of India; Transactions under this Agreement are limited to domestic INR derivative transactions conducted within the CCIL/FEDAI regulatory framework.",
};
const PAYMENT_NETTING_TEXT = {
  all: "For the purpose of Section 2(c), subparagraph (ii) applies to all Transactions, such that all amounts payable on the same date and in the same currency in respect of two or more Transactions are netted into a single payment obligation, not only those within a group the parties separately designate.",
  sameCurrency:
    "For the purpose of Section 2(c), netting follows the printed form: amounts payable on the same date and in the same currency in respect of the same Transaction, or any group of Transactions the parties elect to treat as such, are netted; multiple-transaction payment netting beyond that is not elected.",
  none: "For the purpose of Section 2(c), subparagraph (ii) does not apply, and Section 2(c) is otherwise disapplied in its entirety: each payment obligation under each Transaction is settled gross, without netting against any other payment obligation.",
};
const DISPUTE_RESOLUTION_TEXT = {
  nyExclusive:
    "For the purpose of Section 13(b), each party irrevocably submits to the exclusive jurisdiction of the courts of the State of New York and the United States District Court located in the Borough of Manhattan, and waives any objection to venue in those courts.",
  nyNonExclusive:
    "For the purpose of Section 13(b), each party submits to the non-exclusive jurisdiction of the courts of the State of New York and the United States District Court located in the Borough of Manhattan, as provided in the printed form.",
  londonExclusive: "For the purpose of Section 13(b), each party irrevocably submits to the exclusive jurisdiction of the English courts.",
  londonNonExclusive: "For the purpose of Section 13(b), each party submits to the non-exclusive jurisdiction of the English courts, as provided in the printed form.",
  arbitrationLCIA:
    "Section 13(b) is deleted in its entirety and replaced with an agreement that any dispute arising out of or in connection with this Agreement (including any question as to its existence, validity, or termination) will be referred to and finally resolved by arbitration under the LCIA Rules, seated in London, before a tribunal of three arbitrators, with the language of the arbitration to be English.",
  indianCourtsExclusive: "For the purpose of Section 13(b), each party irrevocably submits to the exclusive jurisdiction of the competent courts at Mumbai, India.",
  indianArbitration:
    "Section 13(b) is deleted in its entirety and replaced with an agreement that any dispute will be finally resolved by arbitration under the Arbitration and Conciliation Act, 1996 (India), seated in Mumbai or GIFT City, before a tribunal constituted in accordance with the rules of the administering institution agreed by the parties.",
};
const TRANSFER_ASSIGNMENT_TEXT = {
  mutualConsent:
    "Section 7 is confirmed as printed: neither party may transfer any interest or obligation under this Agreement without the prior written consent of the other party, such consent not to be unreasonably withheld, except as expressly permitted by Section 7.",
  consentWithDeemedTimer:
    "Section 7 is amended to provide that a party's consent to a transfer is deemed given if it has not notified its objection within five Local Business Days of receiving notice of the proposed transfer, to facilitate novation and portfolio compression exercises.",
  dealerFreeOnAffiliate:
    "Section 7 is amended to permit Dealer to transfer this Agreement, in whole or in part, to any of its Affiliates, or in connection with a merger, consolidation, amalgamation, or transfer of substantially all of its assets, without Counterparty's consent, provided the transferee assumes Dealer's obligations under this Agreement.",
  counterpartyConsentAlways:
    "Section 7 is amended to provide that Counterparty's prior written consent is required for any transfer by Dealer of any interest or obligation under this Agreement, including a transfer to Dealer's own Affiliate, with no exception for a merger or reorganization.",
};
const DEFAULT_INTEREST_TEXT = {
  standard1pct:
    "For the purpose of Section 9(h), the applicable rate for overdue amounts is, in each case, the relevant rate specified in Section 9(h)(i) plus 1%, applied symmetrically regardless of which party owes the overdue amount.",
  symmetricNegotiated:
    "For the purpose of Section 9(h), the applicable rate for overdue amounts is a rate to be agreed, applied identically to both parties regardless of which party owes the overdue amount.",
  asymmetricCostOfFunds:
    "For the purpose of Section 9(h), where Counterparty is the party that has failed to pay, the applicable rate is Dealer's cost of funds plus a spread to be agreed; where Dealer is the party that has failed to pay, the applicable rate is the rate specified in Section 9(h)(i) plus 1%.",
};

function buildPart4(config) {
  return {
    number: 4,
    title: "Miscellaneous",
    items: [
      scheduleItem("Addresses for Notices; Notice Method",
        content([
          "Addresses for notices under Section 12 are as set out on the signature pages of this Agreement, or as separately notified by each party from time to time.",
          mapClause(NOTICE_METHOD_TEXT, config.edge.noticeMethodCloseout),
          mapClause(CONFIRMATION_METHOD_TEXT, config.edge.confirmationMethod),
        ])
      ),
      scheduleItem("Process Agent", content(processAgentClause(config))),
      scheduleItem("Offices; Multibranch Party", content(mapClause(MULTIBRANCH_TEXT, config.frame.multibranch))),
      scheduleItem("Calculation Agent", content(mapClause(CALC_AGENT_TEXT, config.edge.calcAgent))),
      scheduleItem("Credit Support Document", content(mapClause(CREDIT_SUPPORT_DOCUMENT_TEXT, config.attachments.csaStructure))),
      scheduleItem("Credit Support Provider", content(mapClause(CREDIT_SUPPORT_PROVIDER_TEXT, config.core.creditSupportProvider))),
      scheduleItem("Governing Law; Netting of Payments; Jurisdiction",
        content([
          mapClause(GOVERNING_LAW_TEXT, config.frame.governingLaw),
          mapClause(PAYMENT_NETTING_TEXT, config.frame.paymentNetting),
          mapClause(DISPUTE_RESOLUTION_TEXT, config.frame.disputeResolution),
        ])
      ),
      scheduleItem("Transfer", content(mapClause(TRANSFER_ASSIGNMENT_TEXT, config.frame.transferAssignment))),
      scheduleItem("Interest on Overdue Amounts", content(mapClause(DEFAULT_INTEREST_TEXT, config.edge.defaultInterestSpread))),
    ],
  };
}

/* --- Part 5: Other Provisions -------------------------------------------- */

const SETOFF_TEXT = {
  none: "No set-off provision is added; the printed form's silence on set-off governs.",
  narrow:
    "Upon the occurrence of an Early Termination Date, the party owing an amount under Section 6(e) may set off that amount against any other matured amount owed between the same two parties (and no other Affiliate) in the same currency, whether arising under this Agreement or otherwise.",
  broadWithClientAssetCarveout:
    "Upon the occurrence of an Early Termination Date, the party owing an amount under Section 6(e) may set off that amount against any other amount, whether or not matured, owed by the other party or any of its Affiliates, in any currency, converting as necessary at a rate reasonably determined by the setting-off party; provided that this right of set-off does not extend to amounts identified as statutorily client-segregated assets, or to assets held for the account of underlying fund investors rather than for Counterparty's own account.",
  broad:
    "Upon the occurrence of an Early Termination Date, the party owing an amount under Section 6(e) may set off that amount against any other amount, whether or not matured, owed by the other party or any of its Affiliates, in any currency, converting as necessary at a rate reasonably determined by the setting-off party, without qualification or carve-out.",
};
const SANCTIONS_AML_TEXT = {
  none: "No bespoke sanctions or anti-money laundering representation is added beyond what is required by applicable law.",
  standard:
    "Each party represents, as of the date of this Agreement and on each date on which a Transaction is entered into, that neither it nor, to its knowledge, any of its Affiliates is a Sanctioned Person, and that it is in compliance in all material respects with applicable anti-money laundering laws.",
  enhanced:
    "Each party represents, on a continuing basis, that neither it nor, to its knowledge, any of its Affiliates is a Sanctioned Person; each party further agrees to provide, on reasonable request, certifications as to its (and its relevant Affiliates') sanctions and AML compliance status, and a breach of this provision, or a party becoming a Sanctioned Person, constitutes an Additional Termination Event with the party in breach (or so designated) as the sole Affected Party.",
};
const CONFIDENTIALITY_TEXT = {
  none: "No confidentiality provision is added to this Agreement beyond any independent duty a party may owe under applicable law or regulation.",
  mutual:
    "Each party agrees to keep confidential the terms of this Agreement and each Transaction, and any non-public information received from the other party in connection with this Agreement, except for disclosure to its Affiliates, professional advisers, auditors, and regulators, or as required by law or applicable regulation, or with the prior consent of the other party.",
  oneWayProtectsCounterparty:
    "Dealer agrees to keep confidential the terms of this Agreement and each Transaction, and any non-public information received from Counterparty, subject to customary carve-outs for disclosure to Affiliates, advisers, auditors, and regulators, or as required by law. Counterparty is not subject to a corresponding confidentiality obligation in favor of Dealer.",
};
const NON_RELIANCE_ECP_TEXT = {
  none: "No additional non-reliance representations are added beyond Section 3 as printed.",
  standard:
    "Each party represents that it is an \"eligible contract participant\" as defined in the U.S. Commodity Exchange Act, and that, in connection with each Transaction, it has made its own independent decision to enter into that Transaction without reliance on any communication from the other party as investment advice.",
};
const NO_AGENCY_TEXT = {
  includedStandard: "Section 3(g) applies as printed, without amendment: each party represents that it is entering into this Agreement and each Transaction as principal, and not as agent or fiduciary for any other party.",
  carvedOutForAgencyStructures:
    "Section 3(g) is amended and qualified to reflect that Counterparty (or Dealer, as applicable) enters into this Agreement and each Transaction as agent or investment manager for one or more disclosed or undisclosed underlying principal(s), and each reference in this Agreement to that party's obligations is to be read, where the context requires, as extending to its capacity as agent for such principal(s).",
};
const SOVEREIGN_IMMUNITY_TEXT = {
  fullWaiver:
    "Each party irrevocably waives, to the fullest extent permitted by applicable law, (i) any right to trial by jury in any proceeding relating to this Agreement, and (ii) with respect to itself and its revenues and assets, all immunity on the grounds of sovereignty or similar grounds from suit, jurisdiction, attachment, and execution of judgment, whether such immunity exists now or is subsequently acquired.",
  limitedWaiverCentralBankCarveout:
    "Each party irrevocably waives, to the fullest extent permitted by applicable law, any right to trial by jury and any immunity from suit or jurisdiction, but this waiver does not extend to immunity from attachment or execution against property that constitutes the reserve assets of a central bank or monetary authority, or diplomatic or consular property, held for a public, non-commercial purpose.",
  noWaiver: "No party waives any immunity from suit, jurisdiction, attachment, or execution that it or its assets may be entitled to assert under applicable law, including on the grounds of sovereignty.",
};
const RECORDING_CONSENT_TEXT = {
  required:
    "Each party consents to the recording of telephone conversations and electronic communications between the parties in connection with this Agreement and any Transaction, and agrees that such recordings may be submitted in evidence in any proceedings relating to this Agreement.",
  notRequired: "No provision regarding recording of communications is included in this Agreement.",
};
const MFN_TEXT = {
  none: "No \"most favored nation\" provision is included in this Agreement.",
  pricingOnly:
    "If Dealer enters into a materially similar Transaction with another similarly-situated counterparty on pricing or spread terms materially more favorable than those offered to Counterparty, Dealer will, on Counterparty's reasonable request, offer Counterparty the opportunity to amend outstanding, or enter into new, Transactions on those more favorable pricing terms.",
  broad:
    "If Dealer offers another similarly-situated counterparty materially more favorable terms — whether as to pricing, credit support (including Threshold, Minimum Transfer Amount, or Independent Amount), or other material economic terms — Dealer will, on Counterparty's reasonable request, extend the more favorable terms to Counterparty across the corresponding pricing, credit, and collateral provisions of this Agreement and the Credit Support Annex.",
};
const FISH_OR_CUT_BAIT_TEXT = {
  none: "There is no time limit on the Non-defaulting Party's (or Non-affected Party's) right to designate an Early Termination Date following an Event of Default, and Sections 6(a)/(b) apply as printed.",
  reasonable:
    "The Non-defaulting Party's (or Non-affected Party's) right to designate an Early Termination Date following an Event of Default must be exercised within a reasonable time of first becoming aware of that Event of Default; what is reasonable is assessed by reference to the facts and circumstances then prevailing.",
  fixedWindow:
    "The Non-defaulting Party's (or Non-affected Party's) right to designate an Early Termination Date following an Event of Default must be exercised within 20 Local Business Days of first becoming aware of that Event of Default, failing which that right lapses in respect of that particular Event of Default, without prejudice to any subsequent Event of Default.",
};
const PROTOCOL_TEXT = {
  vm2016: "the ISDA 2016 Variation Margin Protocol",
  iborFallbacks: "the ISDA IBOR Fallbacks Protocol and the ISDA 2020 IBOR Fallbacks Supplement",
  resolutionStay: "the ISDA Resolution Stay Jurisdictional Modular Protocol (including the U.S. QFC Stay Rules module)",
  masterAgreementProtocol2002: "the ISDA 2002 Master Agreement Protocol",
  emirRiskMitigation: "the ISDA EMIR Risk Mitigation / Portfolio Reconciliation, Dispute Resolution and Disclosure Protocol",
};
const RESOLUTION_STAY_TEXT = {
  fullContractualStay:
    "The parties agree to a full contractual stay of termination and close-out netting rights exercisable against a party (or its Credit Support Provider) that becomes subject to a resolution or insolvency proceeding, to the extent and in the manner contemplated by the ISDA Resolution Stay Jurisdictional Modular Protocol (or bespoke equivalent language), consistent with applicable special resolution regimes.",
  regulatoryMinimumOnly:
    "Any contractual stay of termination and close-out netting rights is limited to the minimum scope actually compelled by a mandatory special resolution regime applicable to a party (or its Credit Support Provider), and does not extend more broadly.",
  notApplicable: "No contractual stay recognition provision applies; neither party is, as of the date of this Agreement, subject to a special resolution regime that would require one.",
};
const PORTFOLIO_COMPRESSION_TEXT = {
  consentRequired: "Neither party may submit any Transaction to a multilateral portfolio compression or netting cycle without the prior written consent of the other party.",
  automaticParticipation:
    "Either party may submit Transactions to an industry-standard multilateral compression or netting cycle without the separate consent of the other party, subject to the standard terms of the relevant compression service, provided the economic terms of the parties' outstanding Transactions are not altered other than as contemplated by that cycle.",
  dealerDiscretion:
    "Dealer may, in its discretion, submit eligible Transactions to a compression or tear-up cycle, or otherwise terminate and replace economically equivalent Transactions, without Counterparty's separate consent for each such action.",
};
const ESCROW_TEXT = {
  available:
    "Where a Transaction requires non-simultaneous settlement across time zones, either party may require that settlement be effected through an escrow agent on terms to be agreed at the time, to mitigate settlement (Herstatt) risk.",
  notAvailable: "No escrow mechanism is provided for under this Agreement; settlement risk on any non-simultaneous or cross-timezone settlement is allocated as set out in the relevant Confirmation.",
};
const REGULATORY_OVERLAY_TEXT = {
  none: "No cross-border regulatory overlay applies beyond the parties' respective home-jurisdiction regulatory status.",
  indiaOnshore:
    "This Agreement is entered into with a counterparty regulated onshore in India, and Transactions are subject to the foreign exchange control and reporting framework administered by the Reserve Bank of India under FEMA, as applicable.",
  giftCity:
    "One or both parties are regulated by the International Financial Services Centres Authority (IFSCA) and operate from the Gujarat International Finance Tec-City (GIFT City) IFSC; the governing law and jurisdiction elections made elsewhere in this Schedule are unaffected by, and remain effective notwithstanding, that regulatory status.",
  emirEU:
    "At least one party is an EU counterparty within the scope of Regulation (EU) No 648/2012 (EMIR), and the risk mitigation, reporting, and (if applicable) clearing obligations of EMIR apply to Transactions between the parties to the extent required by law.",
  doddFrank:
    "At least one party is a U.S. person or otherwise within the scope of Title VII of the Dodd-Frank Act, and the swap dealer/major swap participant regulatory framework administered by the CFTC (or, as applicable, the SEC) applies to Transactions between the parties to the extent required by law.",
};
const FEMA_APPROVAL_TEXT = {
  notApplicable: "No offshore posting of collateral is contemplated, and no FEMA/RBI cross-border collateral approval is accordingly required.",
  generalPermission: "Cross-border posting of collateral is made in reliance on the general permission available under the RBI Master Direction – Margin for Derivative Contracts, as in effect from time to time.",
  specificApproval: "Cross-border posting of collateral is made pursuant to specific approval obtained from the Reserve Bank of India, a copy of which has been provided to Dealer.",
  pending: "Cross-border posting of collateral is contemplated, but the required RBI/FEMA approval has not yet been obtained as of the date of this Agreement; no offshore collateral will be posted or received until such approval is obtained.",
};

function buildPart5(config) {
  const protocolVals = config.edge.protocolAdherence || [];
  const protocolText = protocolVals.length
    ? `Each party confirms that it has adhered, or agrees to adhere, to the following ISDA protocol(s) as in effect between the parties: ${englishList(protocolVals.map((v) => PROTOCOL_TEXT[v] || v))}.`
    : "No ISDA protocol adherence is elected beyond what applies to the parties by operation of law or by separate agreement.";
  const items = [
    scheduleItem("Set-Off", content(mapClause(SETOFF_TEXT, config.inserts.setoff))),
    scheduleItem("Sanctions and Anti-Money Laundering", content(mapClause(SANCTIONS_AML_TEXT, config.inserts.sanctionsAML))),
    scheduleItem("Confidentiality", content(mapClause(CONFIDENTIALITY_TEXT, config.inserts.confidentiality))),
    scheduleItem("Non-Reliance; ECP Representations", content(mapClause(NON_RELIANCE_ECP_TEXT, config.inserts.nonRelianceECP))),
    scheduleItem("No Agency Representation", content(mapClause(NO_AGENCY_TEXT, config.inserts.noAgencyRepresentation))),
    scheduleItem("Waiver of Jury Trial; Sovereign Immunity", content(mapClause(SOVEREIGN_IMMUNITY_TEXT, config.frame.sovereignImmunityWaiver))),
    scheduleItem("Recording of Conversations", content(mapClause(RECORDING_CONSENT_TEXT, config.inserts.recordingConsent))),
    scheduleItem("Most Favored Nation", content(mapClause(MFN_TEXT, config.inserts.mostFavoredNation))),
    scheduleItem("Fish-or-Cut-Bait", content(mapClause(FISH_OR_CUT_BAIT_TEXT, config.inserts.fishOrCutBait))),
    scheduleItem("ISDA Protocol Adherence", content(protocolText)),
    scheduleItem("Resolution Stay and Bail-in Recognition", content(mapClause(RESOLUTION_STAY_TEXT, config.edge.resolutionStayRecognition))),
    scheduleItem("Portfolio Compression", content(mapClause(PORTFOLIO_COMPRESSION_TEXT, config.edge.portfolioCompression))),
    scheduleItem("Escrow for Non-Simultaneous Settlement", content(mapClause(ESCROW_TEXT, config.edge.escrowNonSimultaneous))),
  ];
  const regulatoryParas = [mapClause(REGULATORY_OVERLAY_TEXT, config.inserts.regulatoryOverlay)];
  const femaField = fieldOf("inserts", "femaCollateralApproval");
  if (conditionalMatch(femaField, config, "inserts")) regulatoryParas.push(mapClause(FEMA_APPROVAL_TEXT, config.inserts.femaCollateralApproval));
  items.push(scheduleItem("Cross-Border Regulatory Overlay", content(regulatoryParas)));
  return { number: 5, title: "Other Provisions", items };
}

/* --- Credit Support Annex — Paragraph 13 --------------------------------- */

const CSA_STRUCTURE_TEXT = {
  vmTitleTransferEnglish:
    "This Credit Support Annex is the 1995 ISDA Credit Support Annex (Transfer — English law), under which title to Eligible Credit Support transfers outright to the Transferee, subject to the Transferee's obligation to make Equivalent Credit Support (or Equivalent Distributions) available to the Transferor as provided herein.",
  vmPledgeNY:
    "This Credit Support Annex is the 1994 ISDA Credit Support Annex (Bilateral Form — New York law), under which each party grants the other a security interest in, and lien on, posted collateral to secure its Obligations, without an outright transfer of title.",
  vmImBilateral:
    "This Credit Support Annex reflects bilateral Variation Margin and Initial Margin arrangements structured to comply with the applicable Uncleared Margin Rules (Prudential Regulators / CFTC), with Initial Margin held in a segregated third-party custody arrangement as provided below.",
};
const HAIRCUT_TEXT = {
  cashOnlyZero: "Eligible Collateral is limited to Cash in an Eligible Currency, and the Valuation Percentage for Cash is 100%.",
  standard:
    "Valuation Percentages follow the standard published schedule (illustratively: 100% for Cash; 99.5%–96% for G7 government bonds depending on remaining maturity; 92% for eligible non-G7/EM government bonds; 85% for listed equities), applied per Eligible Collateral type.",
  aggressive:
    "Valuation Percentages are set bilaterally at levels more conservative than the standard published schedule, typically 5–10 percentage points lower per Eligible Collateral type, as agreed between the parties and recorded in a supplemental haircut grid.",
};
const CASH_INTEREST_TEXT = {
  sofrFlat: "The Interest Rate payable on posted Cash in USD is SOFR (or, for Cash in another Eligible Currency, the corresponding risk-free reference rate for that currency), in each case flat, as published for the relevant Interest Period.",
  sofrMinusSpread: "The Interest Rate payable on posted Cash is the relevant risk-free reference rate for the currency in question (e.g., SOFR for USD) minus a spread of 25 basis points.",
  fedFundsFlat: "The Interest Rate payable on posted Cash in USD is the overnight Federal Funds (effective) rate, flat, as published for the relevant Interest Period.",
};
const VALUATION_AGENT_TEXT = {
  dealerSole: "Dealer is the Valuation Agent for all purposes of this Annex.",
  jointDisclosed:
    "Dealer is the Valuation Agent, provided that Dealer will disclose its valuation methodology and inputs to Counterparty on request, and any dispute as to a Valuation Agent determination is subject to the dispute resolution procedure below.",
  counterpartyOrThirdParty: "Counterparty, or an independent third-party pricing source agreed between the parties, is the Valuation Agent.",
};
const CSA_DISPUTE_TIMING_TEXT = {
  oneLocalBusinessDay: "A dispute notified under the dispute resolution procedure of this Annex is resolved, and any resulting recalculation made, no later than the close of business on the first Local Business Day following the day the dispute notice is given.",
  sameDay: "A dispute notified under the dispute resolution procedure of this Annex is resolved, and any resulting recalculation made, on the same Local Business Day the dispute notice is given.",
  extended: "A dispute notified under the dispute resolution procedure of this Annex is resolved, and any resulting recalculation made, no later than the close of business on the third Local Business Day following the day the dispute notice is given.",
};
const CONCENTRATION_LIMITS_TEXT = {
  none: "No concentration limits apply to any Eligible Collateral type or issuer.",
  standard: "Non-cash Eligible Collateral is subject to a concentration limit of 20% of the aggregate value of posted collateral per issuer and per asset class, tested on each Valuation Date.",
  tight: "Non-cash Eligible Collateral is subject to a concentration limit of 10% of the aggregate value of posted collateral per issuer, together with single-obligor and single-asset-class sub-limits, tested on each Valuation Date.",
};
const DEMAND_MECHANIC_TEXT = {
  onDemand: "A transfer under Paragraph 3 is made only following a demand by the party entitled to call for it, in accordance with the printed English law CSA form.",
  automatic: "Transfers under Paragraph 3 are made automatically on each Valuation Date without a separate demand, subject to the applicable Minimum Transfer Amount and rounding conventions.",
};
const DISTRIBUTIONS_TEXT = {
  included: "The \"Distributions\" provisions of Paragraph 6 apply: the Transferee will transfer to the Transferor an amount equal to any interest, dividends, or other distributions paid or made on transferred Equivalent Credit Support.",
  excluded: "The \"Distributions\" provisions of Paragraph 6 do not apply; distributions paid or made on transferred Equivalent Credit Support are retained by the Transferee.",
};
const CUSTODIAN_ARRANGEMENT_TEXT = {
  none: "Collateral posted under this Annex is held directly by the Secured Party (or, in the case of collateral posted by the Secured Party, returned directly), without a third-party custodian.",
  thirdParty: "Collateral posted under this Annex is held by a third-party custodian meeting the Eligible Custodian criteria to be agreed between the parties (at minimum, a rating and jurisdiction requirement).",
  triParty: "Collateral posted under this Annex is held pursuant to a tri-party custodian arrangement, under which the tri-party agent independently values, allocates, and safekeeps posted collateral in accordance with the parties' eligibility and concentration instructions.",
};
const REHYPOTHECATION_TEXT = {
  full: "The Secured Party has the unrestricted right under Paragraph 6(c) to sell, pledge, rehypothecate, assign, invest, use, commingle, or otherwise dispose of, or use in its business, any posted collateral, free of any claim or right of the Pledgor.",
  recallable: "The Secured Party may exercise rights of use under Paragraph 6(c) with respect to posted collateral, subject to the Pledgor's right to recall equivalent collateral on reasonable notice for return, substitution, or in connection with a Valuation Date recalculation.",
  none: "The Secured Party has no right of use under Paragraph 6(c); posted collateral is held segregated and is not sold, pledged, rehypothecated, or otherwise used by the Secured Party.",
};
const SUBSTITUTION_TEXT = {
  automatic: "The Pledgor may substitute posted collateral for other Eligible Collateral of equivalent value on notice to the Secured Party, without requiring the Secured Party's consent.",
  consentRequired: "The Pledgor may substitute posted collateral for other Eligible Collateral of equivalent value only with the Secured Party's consent, not to be unreasonably withheld or delayed.",
  soleDiscretion: "The Pledgor may substitute posted collateral for other Eligible Collateral of equivalent value only with the Secured Party's consent, which may be given or withheld in the Secured Party's sole and absolute discretion.",
};
const IM_CALCULATION_TEXT = {
  simm: "Initial Margin is calculated using the ISDA Standard Initial Margin Model (SIMM), subject to the parties' ongoing governance, backtesting, and dispute-resolution obligations under the ISDA SIMM Governance Framework.",
  standardizedSchedule: "Initial Margin is calculated using the standardized, grid-based Initial Margin schedule prescribed under the applicable Uncleared Margin Rules, rather than a model-based approach.",
};
const SEGREGATION_TEXT = {
  thirdPartySegregated: "Initial Margin is held in a third-party segregated custody account in the name of, or for the benefit of, the posting party, with no right of rehypothecation, consistent with the segregation requirements of the applicable Uncleared Margin Rules.",
  triParty: "Initial Margin is held pursuant to a tri-party custodian arrangement, under which the tri-party agent manages eligibility screening, valuation, and segregation of posted Initial Margin.",
};
const IM_CUSTODIAN_APPROVAL_TEXT = {
  mutualConsent: "The Initial Margin custodian is selected, and may only be replaced, by mutual written consent of both parties.",
  securedPartyDiscretion: "The Initial Margin custodian is selected by the Secured Party from a list of custodians it has approved from time to time, in the Secured Party's sole discretion.",
};
const ELIGIBLE_COLLATERAL_TEXT = {
  cashUSD: "Cash — USD",
  cashOther: "Cash — other freely convertible G7 currency",
  usTreasuries: "Negotiable debt obligations issued by the U.S. Treasury Department",
  nonUSGovt: "Negotiable debt obligations issued by other G7 sovereign issuers",
  equities: "Listed equity securities on a Major Market",
  mmf: "Shares or units in a qualifying money market fund",
  inrGSecs: "Government of India dated securities and Treasury Bills (onshore G-Secs)",
  inrCorpBonds: "AAA-rated (CRISIL/ICRA/CARE) Indian corporate bonds (onshore)",
};

function csaConditionalItem(config, heading, cat, key, textMap) {
  const field = fieldOf(cat, key);
  if (!conditionalMatch(field, config, cat)) return null;
  return scheduleItem(heading, content(mapClause(textMap, config[cat][key])));
}

function buildCsa(config) {
  const csaField = fieldOf("attachments", "csaStructure");
  const iaField = fieldOf("attachments", "independentAmount");
  const thField = fieldOf("attachments", "threshold");
  const mtaField = fieldOf("attachments", "mta");
  const collateralVals = config.attachments.eligibleCollateral || [];

  const items = [
    scheduleItem("Type of Annex", content(mapClause(CSA_STRUCTURE_TEXT, config.attachments.csaStructure))),
    scheduleItem("Independent Amount", content(dualAmountSentence(iaField, config.attachments.independentAmount, "Independent Amount", "this Paragraph 13"))),
    scheduleItem("Threshold", content(dualAmountSentence(thField, config.attachments.threshold, "Threshold", "this Paragraph 13"))),
    scheduleItem("Minimum Transfer Amount", content(dualAmountSentence(mtaField, config.attachments.mta, "Minimum Transfer Amount", "this Paragraph 13"))),
    scheduleItem("Eligible Collateral",
      content("The following constitute Eligible Collateral for the purposes of this Annex:", {
        headers: ["Eligible Collateral"],
        rows: collateralVals.length ? collateralVals.map((v) => [ELIGIBLE_COLLATERAL_TEXT[v] || v]) : [["Cash — USD (ISDA default)"]],
      })
    ),
    scheduleItem("Valuation Percentage", content(mapClause(HAIRCUT_TEXT, config.attachments.haircutLevel))),
    scheduleItem("Interest Rate on Posted Cash", content(mapClause(CASH_INTEREST_TEXT, config.attachments.interestRateCashCollateral))),
    scheduleItem("Valuation Agent", content(mapClause(VALUATION_AGENT_TEXT, config.attachments.valuationAgent))),
    scheduleItem("Dispute Resolution", content(mapClause(CSA_DISPUTE_TIMING_TEXT, config.attachments.disputeResolutionTiming))),
    scheduleItem("Concentration Limits", content(mapClause(CONCENTRATION_LIMITS_TEXT, config.attachments.concentrationLimits))),
  ];

  [
    csaConditionalItem(config, "Transfer Demand Mechanic", "attachments", "demandMechanic", DEMAND_MECHANIC_TEXT),
    csaConditionalItem(config, "Distributions", "attachments", "distributionsElection", DISTRIBUTIONS_TEXT),
    csaConditionalItem(config, "Custodian Arrangement", "attachments", "custodianArrangement", CUSTODIAN_ARRANGEMENT_TEXT),
    csaConditionalItem(config, "Right of Use / Rehypothecation", "attachments", "rehypothecationRights", REHYPOTHECATION_TEXT),
    csaConditionalItem(config, "Substitution", "attachments", "substitutionConsent", SUBSTITUTION_TEXT),
    csaConditionalItem(config, "Initial Margin Calculation Method", "attachments", "imCalculationMethod", IM_CALCULATION_TEXT),
    csaConditionalItem(config, "Initial Margin Segregation", "attachments", "segregationStructure", SEGREGATION_TEXT),
    csaConditionalItem(config, "Initial Margin Custodian Approval", "attachments", "custodianApproval", IM_CUSTODIAN_APPROVAL_TEXT),
  ].forEach((it) => it && items.push(it));

  return {
    title: "Credit Support Annex — Paragraph 13: Elections and Variables",
    introParagraphs: [
      mapClause(CSA_STRUCTURE_TEXT, config.attachments.csaStructure),
      `Unless otherwise stated, "Base Currency" for the purposes of this Annex is the Termination Currency specified in {{ref:termination-currency}} of the Schedule above.`,
    ],
    items,
  };
}

/* --- Document assembly, Markdown + docx rendering ------------------------ */

function letterFor(i) {
  return String.fromCharCode(97 + i); // 0 -> "a", 1 -> "b", ...
}

// Assigns display markers (letters within Part 1/2/4 and the CSA, numbers
// within Part 5) by POSITION in the already-filtered item list, rather than
// baking a marker into each item definition. This is what keeps the CSA's
// conditional sub-items (only some of which render, depending on
// csaStructure) lettered consecutively instead of skipping — e.g. under the
// Pledge structure the visible items are (a)...(j) then (k)(l)(m), never
// jumping straight from (j) to (m) the way a hardcoded-per-item marker would.
function assignMarkers(doc) {
  doc.parts.forEach((part) => {
    const useNumbers = part.number === 5;
    const singleUnlettered = part.items.length === 1 && part.number === 3;
    part.items.forEach((it, i) => {
      // markerBare is the raw letter/number with no punctuation, used only to
      // build cross-reference strings (see resolveCrossReferences below).
      // marker is the DISPLAYED label, which follows drafting convention —
      // "(a)" for Parts 1/2/4 and the CSA, but a bare "1." for Part 5's
      // numbered paragraphs. Cross-references always parenthesize
      // markerBare regardless of that display convention, so a reference
      // into Part 5 reads "Part 5(1)" rather than the two concatenating
      // into "Part 51".
      it.markerBare = singleUnlettered ? "" : useNumbers ? String(i + 1) : letterFor(i);
      it.marker = singleUnlettered ? "" : useNumbers ? String(i + 1) : `(${letterFor(i)})`;
    });
  });
  doc.csa.items.forEach((it, i) => {
    it.markerBare = letterFor(i);
    it.marker = `(${letterFor(i)})`;
  });
  return doc;
}

// Builds a refKey -> "Part N(x)" / "Paragraph 13(x)" lookup from the markers
// just assigned, then substitutes every {{ref:refKey}} token left in the
// drafted clause text. Because this runs AFTER assignMarkers and BEFORE
// either renderer touches the document, both the Markdown and the .docx
// output are guaranteed to agree — there's exactly one place a cross-
// reference gets resolved, not two copies that could drift apart. A refKey
// that doesn't resolve (typo, or a reference to a since-removed item) falls
// back to a visibly-wrong placeholder instead of silently vanishing, so a
// bad reference is obvious in a proof-read rather than a landmine.
function resolveCrossReferences(doc) {
  const refMap = {};
  doc.parts.forEach((part) => {
    part.items.forEach((it) => {
      const parenMarker = it.markerBare ? `(${it.markerBare})` : "";
      refMap[it.refKey] = `Part ${part.number}${parenMarker}`;
    });
  });
  doc.csa.items.forEach((it) => {
    refMap[it.refKey] = `Paragraph 13(${it.markerBare})`;
  });
  const sub = (s) => s.replace(/\{\{ref:([a-z0-9-]+)\}\}/g, (m, key) => refMap[key] || "[cross-reference unresolved]");
  const fixItem = (it) => {
    it.paragraphs = it.paragraphs.map(sub);
    if (it.table) it.table.rows = it.table.rows.map((row) => row.map(sub));
  };
  doc.parts.forEach((part) => part.items.forEach(fixItem));
  doc.csa.items.forEach(fixItem);
  doc.preambleParagraphs = doc.preambleParagraphs.map(sub);
  doc.csa.introParagraphs = doc.csa.introParagraphs.map(sub);
  doc.closingParagraphs = doc.closingParagraphs.map(sub);
  return doc;
}

function buildPreamble(dealDetails) {
  const dd = dealDetails || {};
  const dealerName = sanitizeUserText((dd.dealerName || "").trim()) || "[DEALER LEGAL NAME]";
  const counterpartyName = sanitizeUserText((dd.counterpartyName || "").trim()) || "[COUNTERPARTY LEGAL NAME]";
  const dateText = (dd.agreementDate || "").trim()
    ? new Date(dd.agreementDate + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "[DATE]";
  return [
    `This Schedule forms part of, and is incorporated into, the Master Agreement dated as of ${dateText} (the "Agreement") between ${dealerName} ("Party A," referred to throughout as "Dealer") and ${counterpartyName} ("Party B," referred to throughout as "Counterparty").`,
    "Capitalized terms not otherwise defined in this Schedule have the meanings given to them in the Agreement.",
  ];
}

function buildScheduleDocument(config, dealDetails) {
  const doc = {
    title: "SCHEDULE",
    subtitle: "to the ISDA Master Agreement (2002 form)",
    preambleParagraphs: buildPreamble(dealDetails),
    parts: [buildPart1(config), buildPart2(config), buildPart3(config), buildPart4(config), buildPart5(config)],
    csa: buildCsa(config),
    closingParagraphs: [
      "This document is a machine-generated draft produced by the ISDA Master Agreement Jigsaw planning tool by slapping the elections made on its interactive board onto boilerplate language. It is semi-parodical, educational in nature and prone to errors due to lack of foresight on the part of, or sheer lethargy of, the builder. It is not meant to be a substitute for the exercise of human judgement. It is not meant for execution in any manner, other than perhaps as a practical joke. Bracketed placeholders must be completed, every clause must be checked against the parties' actual negotiated terms, before this document is used to cheat on your homework.",
    ],
  };
  return resolveCrossReferences(assignMarkers(doc));
}

function renderItemMarkdown(labelPrefix, it) {
  const lines = [];
  lines.push(`**${labelPrefix}${it.marker ? it.marker + " " : ""}${it.heading}.** ${it.paragraphs[0] || ""}`);
  it.paragraphs.slice(1).forEach((extra) => {
    lines.push("");
    lines.push(extra);
  });
  if (it.table) {
    lines.push("");
    lines.push(`| ${it.table.headers.join(" | ")} |`);
    lines.push(`| ${it.table.headers.map(() => "---").join(" | ")} |`);
    it.table.rows.forEach((r) => lines.push(`| ${r.join(" | ")} |`));
  }
  lines.push("");
  return lines;
}

function renderScheduleMarkdown(doc) {
  const lines = [`# ${doc.title}`, `*${doc.subtitle}*`, ""];
  doc.preambleParagraphs.forEach((t) => {
    lines.push(t);
    lines.push("");
  });
  doc.parts.forEach((part) => {
    lines.push(`## Part ${part.number} — ${part.title}`);
    lines.push("");
    part.items.forEach((it) => lines.push(...renderItemMarkdown("", it)));
  });
  lines.push(`## ${doc.csa.title}`);
  lines.push("");
  doc.csa.introParagraphs.forEach((t) => {
    lines.push(t);
    lines.push("");
  });
  doc.csa.items.forEach((it) => lines.push(...renderItemMarkdown("Paragraph 13", it)));
  if (doc.csa.onlyInAItems && doc.csa.onlyInAItems.length) {
    lines.push(`### ${doc.csa.onlyInALabel}`);
    lines.push("");
    doc.csa.onlyInAItems.forEach((it) => lines.push(...renderItemMarkdown("", it)));
  }
  if (doc.csa.onlyInBItems && doc.csa.onlyInBItems.length) {
    lines.push(`### ${doc.csa.onlyInBLabel}`);
    lines.push("");
    doc.csa.onlyInBItems.forEach((it) => lines.push(...renderItemMarkdown("", it)));
  }
  lines.push("---");
  lines.push("");
  doc.closingParagraphs.forEach((t) => {
    lines.push(`*${t}*`);
    lines.push("");
  });
  return lines.join("\n");
}

// Splits "plain **bold** plain" into docx runs. Only the small "**...**"
// subset used by this generator (e.g. the redline's "**Current:**" /
// "**Comparison:**" labels) needs to survive into Word — a full Markdown
// parser would be overkill for content this tool authors itself.
// ~~del~~/++ins++ only ever come from the redline diff engine (diffOpsToMarkdown)
// — never from ordinary Schedule drafting text — so mapping them straight to
// real <w:ins>/<w:del> revisions here is safe without a separate flag. Word's
// Track Changes / Review pane renders and Accept/Reject-handles these natively;
// no manual strikethrough/underline styling is layered on top, since Word
// already renders ins/del that way itself.
function parseInlineRuns(text) {
  const parts = String(text || "").split(/(\*\*.+?\*\*|~~.+?~~|\+\+.+?\+\+)/g);
  const runs = parts
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) return { text: part.slice(2, -2), bold: true };
      if (part.startsWith("~~") && part.endsWith("~~")) return { text: part.slice(2, -2), revision: "del" };
      if (part.startsWith("++") && part.endsWith("++")) return { text: part.slice(2, -2), revision: "ins" };
      return { text: part };
    });
  return runs.length ? runs : [{ text: "" }];
}

function itemToDocxBlocks(labelPrefix, it) {
  const blocks = [
    {
      type: "paragraph",
      runs: [{ text: `${labelPrefix}${it.marker ? it.marker + " " : ""}${it.heading}. `, bold: true }, ...parseInlineRuns(it.paragraphs[0] || "")],
    },
  ];
  it.paragraphs.slice(1).forEach((extra) => blocks.push({ type: "paragraph", runs: parseInlineRuns(extra), indent: 360 }));
  if (it.table) blocks.push({ type: "table", headers: it.table.headers, rows: it.table.rows.map((r) => r.map((c) => parseInlineRuns(c))) });
  return blocks;
}

function scheduleDocToDocxBlocks(doc) {
  const blocks = [{ type: "title", text: doc.title }, { type: "subtitle", text: doc.subtitle }];
  doc.preambleParagraphs.forEach((t) => blocks.push({ type: "paragraph", runs: [{ text: t }] }));
  blocks.push({ type: "spacer" });
  doc.parts.forEach((part) => {
    blocks.push({ type: "heading1", text: `Part ${part.number} — ${part.title}` });
    part.items.forEach((it) => blocks.push(...itemToDocxBlocks("", it)));
  });
  blocks.push({ type: "pagebreak" });
  blocks.push({ type: "heading1", text: doc.csa.title });
  doc.csa.introParagraphs.forEach((t) => blocks.push({ type: "paragraph", runs: [{ text: t }] }));
  doc.csa.items.forEach((it) => blocks.push(...itemToDocxBlocks("Paragraph 13", it)));
  if (doc.csa.onlyInAItems && doc.csa.onlyInAItems.length) {
    blocks.push({ type: "heading3", text: doc.csa.onlyInALabel });
    doc.csa.onlyInAItems.forEach((it) => blocks.push(...itemToDocxBlocks("", it)));
  }
  if (doc.csa.onlyInBItems && doc.csa.onlyInBItems.length) {
    blocks.push({ type: "heading3", text: doc.csa.onlyInBLabel });
    doc.csa.onlyInBItems.forEach((it) => blocks.push(...itemToDocxBlocks("", it)));
  }
  blocks.push({ type: "hr" });
  doc.closingParagraphs.forEach((t) => blocks.push({ type: "paragraph", runs: [{ text: t, italic: true, color: "777777", size: 18 }] }));
  return blocks;
}

function generateScheduleOutputs() {
  const doc = buildScheduleDocument(STATE.config, STATE.dealDetails);
  const markdown = renderScheduleMarkdown(doc);
  const docxBlob = buildDocxBlob(scheduleDocToDocxBlocks(doc), { title: "ISDA Schedule & CSA", creator: "ISDA Master Agreement Jigsaw" });
  return { markdown, docxBlob };
}

/* --- Schedule redline: same document shape, diffed at the item level ---- */
/* Matches items between the two built documents by refKey (not by array    */
/* position), so this stays correct even where the CSA's conditional sub-   */
/* items differ between the two configurations. Because the result is       */
/* assembled into the exact same {title, parts, csa, ...} shape as a plain  */
/* Schedule document, it flows through the same renderScheduleMarkdown() /  */
/* scheduleDocToDocxBlocks() renderers unchanged — one rendering path for   */
/* both, so Markdown and .docx can't disagree with each other here either.  */

/* --- Word-level diff engine — an actual redline, not a before/after report */
/* Splits each paragraph into words + whitespace tokens and runs a classic   */
/* LCS-based diff over them, so the output marks only the words that changed */
/* — struck-through for text that's only in the current configuration,       */
/* underlined for text that's only in the comparison — instead of repeating  */
/* both full paragraphs side by side. mdInline() renders ~~text~~ as <del>   */
/* and ++text++ as <ins>; parseInlineRuns() renders the same two tokens as   */
/* actual strikethrough/underline runs in the .docx, so a redline reads the  */
/* same way — as a redline — in both formats.                                */

function tokenizeForDiff(text) {
  return String(text || "").match(/\S+|\s+/g) || [];
}

function diffWords(a, b) {
  const ta = tokenizeForDiff(a);
  const tb = tokenizeForDiff(b);
  const n = ta.length;
  const m = tb.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      ops.push({ type: "same", text: ta[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: ta[i] });
      i++;
    } else {
      ops.push({ type: "ins", text: tb[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", text: ta[i++] });
  while (j < m) ops.push({ type: "ins", text: tb[j++] });
  const merged = [];
  ops.forEach((op) => {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else merged.push({ ...op });
  });
  return merged;
}

function diffOpsToMarkdown(ops) {
  return ops
    .map((op) => {
      if (op.type === "del") return `~~${op.text}~~`;
      if (op.type === "ins") return `++${op.text}++`;
      return op.text;
    })
    .join("");
}

// Raw LCS word-diffing reads well when the two versions genuinely share
// wording (e.g. only a currency code or a day-count changed) — but this
// tool's clause options are frequently full alternative drafting positions
// (narrow vs. broad set-off, two structurally different cross-default
// triggers) that happen to reuse the same handful of short defined terms
// ("Section 5(a)(vi)," "due," "declared," "not") in a completely different
// order. LCS still finds those as "matches" and threads a highlight through
// every one of them, which produces exactly the illegible word-salad this
// was built to avoid — dozens of tiny alternating spans instead of a
// readable redline. The fix isn't overall word overlap (that pathological
// case can score high on raw overlap too, since so many individual words
// coincide) — it's whether there's at least one genuinely long CONTIGUOUS
// run in common, the signature of real shared wording like a shared clause
// preamble. Below that bar, the two versions are a rewrite, not an edit,
// and get shown as a clean whole-paragraph swap instead: fully struck,
// fully underlined — exactly two spans, not forty.
// An absolute floor alone shortchanges short sentences — "Termination
// Currency" means X." has only a 3-word shared prefix ("Termination
// Currency" means), well under 5, but that IS effectively the whole
// non-varying part of a 6-word sentence. So a run also counts as
// "worthwhile" if it covers a large enough share of the shorter side,
// even if it doesn't clear the absolute floor.
const MIN_CONTIGUOUS_MATCH_WORDS = 5;
const MIN_CONTIGUOUS_MATCH_RATIO = 0.4;

function diffParagraph(a, b) {
  if (a === b) return a;
  const ops = diffWords(a, b);
  let longestSameRun = 0;
  ops.forEach((op) => {
    if (op.type !== "same") return;
    const words = (op.text.match(/\S+/g) || []).length;
    if (words > longestSameRun) longestSameRun = words;
  });
  const wordsA = (a.match(/\S+/g) || []).length;
  const wordsB = (b.match(/\S+/g) || []).length;
  const shorterLen = Math.min(wordsA, wordsB) || 1;
  const worthwhile = longestSameRun >= MIN_CONTIGUOUS_MATCH_WORDS || longestSameRun / shorterLen >= MIN_CONTIGUOUS_MATCH_RATIO;
  if (!worthwhile) {
    return diffOpsToMarkdown([
      { type: "del", text: a },
      { type: "same", text: " " },
      { type: "ins", text: b },
    ]);
  }
  return diffOpsToMarkdown(ops);
}

// Aligns two paragraph arrays by INDEX (each item's paragraphs are always
// generated in the same fixed order — e.g. Cross Default is always [trigger
// scope, indebtedness carve-out, threshold amount] on both sides — so
// positional alignment is reliable here, unlike CSA sub-ITEMS, which are
// matched by refKey because entire items can be missing on one side).
function diffParagraphArrays(parasA, parasB) {
  const maxLen = Math.max(parasA.length, parasB.length);
  const result = [];
  for (let idx = 0; idx < maxLen; idx++) {
    const a = parasA[idx];
    const b = parasB[idx];
    if (a != null && b != null) {
      result.push(diffParagraph(a, b));
    } else if (a != null) {
      result.push(diffOpsToMarkdown([{ type: "del", text: a }]));
    } else {
      result.push(diffOpsToMarkdown([{ type: "ins", text: b }]));
    }
  }
  return result;
}

function diffTable(tableA, tableB) {
  if (!tableA || !tableB) return tableA || tableB;
  const sameShape = tableA.rows.length === tableB.rows.length && tableA.headers.length === tableB.headers.length;
  if (!sameShape) {
    // Row counts genuinely differ (e.g. a different set of documents
    // selected) — there's no reliable positional alignment, so show the
    // current rows struck and the comparison's rows underlined, stacked.
    return {
      headers: tableA.headers,
      rows: [
        ...tableA.rows.map((r) => r.map((c) => diffOpsToMarkdown([{ type: "del", text: c }]))),
        ...tableB.rows.map((r) => r.map((c) => diffOpsToMarkdown([{ type: "ins", text: c }]))),
      ],
    };
  }
  return {
    headers: tableA.headers,
    rows: tableA.rows.map((rowA, i) =>
      rowA.map((cellA, j) => diffParagraph(cellA, tableB.rows[i][j]))
    ),
  };
}

function mergeRedlinePart(number, title, itemsA, itemsB) {
  const bByKey = new Map(itemsB.map((it) => [it.refKey, it]));
  const usedBKeys = new Set();
  const merged = itemsA.map((itA) => {
    usedBKeys.add(itA.refKey);
    const itB = bByKey.get(itA.refKey);
    if (!itB) {
      return {
        refKey: itA.refKey,
        heading: itA.heading,
        paragraphs: itA.paragraphs.map((p) => diffOpsToMarkdown([{ type: "del", text: p }])),
        table: itA.table ? { headers: itA.table.headers, rows: itA.table.rows.map((r) => r.map((c) => diffOpsToMarkdown([{ type: "del", text: c }]))) } : null,
      };
    }
    const identical = JSON.stringify(itA.paragraphs) === JSON.stringify(itB.paragraphs) && JSON.stringify(itA.table) === JSON.stringify(itB.table);
    if (identical) return { refKey: itA.refKey, heading: itA.heading, paragraphs: itA.paragraphs, table: itA.table };
    return {
      refKey: itA.refKey,
      heading: itA.heading,
      paragraphs: diffParagraphArrays(itA.paragraphs, itB.paragraphs),
      table: diffTable(itA.table, itB.table),
    };
  });
  itemsB.forEach((itB) => {
    if (usedBKeys.has(itB.refKey)) return;
    merged.push({
      refKey: itB.refKey,
      heading: itB.heading,
      paragraphs: itB.paragraphs.map((p) => diffOpsToMarkdown([{ type: "ins", text: p }])),
      table: itB.table ? { headers: itB.table.headers, rows: itB.table.rows.map((r) => r.map((c) => diffOpsToMarkdown([{ type: "ins", text: c }]))) } : null,
    });
  });
  return { number, title, items: merged };
}

const CSA_STRUCTURE_SHORT_LABEL = {
  vmTitleTransferEnglish: "Title Transfer, English law",
  vmPledgeNY: "Pledge Annex, New York law",
  vmImBilateral: "Bilateral VM + IM",
};
function csaStructureShortLabel(value) {
  return CSA_STRUCTURE_SHORT_LABEL[value] || value;
}

// CSA sub-items are the only place a plain Part ever has an item present on
// one side of a redline and absent on the other (see assignMarkers' comment
// on why Parts 1/2/4/5 never hit that case in practice). Continuing the same
// Paragraph 13(a)(b)(c)... sequence across genuinely mutually-exclusive
// regimes — e.g. Pledge-only "Right of Use / Rehypothecation" sitting right
// next to Title-Transfer-only "Distributions" under consecutive letters —
// reads as one coherent 15-item CSA that no real document would ever have.
// So unlike mergeRedlinePart, this keeps the three buckets separate: shared
// elections stay under the normal lettered sequence, and each side's
// structure-specific elections get their own unlettered, clearly-headed
// group instead of borrowing the main sequence's letters.
function mergeRedlineCsaItems(itemsA, itemsB) {
  const bByKey = new Map(itemsB.map((it) => [it.refKey, it]));
  const usedBKeys = new Set();
  const shared = [];
  const onlyInA = [];
  itemsA.forEach((itA) => {
    const itB = bByKey.get(itA.refKey);
    if (!itB) {
      // Structure-specific — grouped under its own heading (see
      // buildScheduleRedlineDocument), not a redlined edit, so left as plain
      // text rather than struck-through.
      onlyInA.push({ refKey: itA.refKey, heading: itA.heading, paragraphs: itA.paragraphs, table: itA.table });
      return;
    }
    usedBKeys.add(itA.refKey);
    const identical = JSON.stringify(itA.paragraphs) === JSON.stringify(itB.paragraphs) && JSON.stringify(itA.table) === JSON.stringify(itB.table);
    if (identical) {
      shared.push({ refKey: itA.refKey, heading: itA.heading, paragraphs: itA.paragraphs, table: itA.table });
      return;
    }
    shared.push({
      refKey: itA.refKey,
      heading: itA.heading,
      paragraphs: diffParagraphArrays(itA.paragraphs, itB.paragraphs),
      table: diffTable(itA.table, itB.table),
    });
  });
  const onlyInB = itemsB
    .filter((itB) => !usedBKeys.has(itB.refKey))
    .map((itB) => ({ refKey: itB.refKey, heading: itB.heading, paragraphs: itB.paragraphs, table: itB.table }));
  return { shared, onlyInA, onlyInB };
}

function buildScheduleRedlineDocument(configA, dealA, configB, dealB, labelA, labelB) {
  const docA = buildScheduleDocument(configA, dealA);
  const docB = buildScheduleDocument(configB, dealB);
  const legend = `Redline legend: struck-through text appears only under ${labelA}; underlined text appears only under ${labelB}. Unmarked text is common to both.`;
  const merged = {
    title: "SCHEDULE — REDLINE",
    subtitle: `${labelA} vs. ${labelB}`,
    preambleParagraphs: [legend, ...docA.preambleParagraphs],
    parts: docA.parts.map((partA, i) => mergeRedlinePart(partA.number, partA.title, partA.items, docB.parts[i].items)),
    csa: null,
    closingParagraphs: docA.closingParagraphs,
  };

  const structureA = configA.attachments.csaStructure;
  const structureB = configB.attachments.csaStructure;
  const structureMismatch = structureA !== structureB;
  const csaMerge = mergeRedlineCsaItems(docA.csa.items, docB.csa.items);
  const csaIntro = structureMismatch
    ? [
        `${labelA} and ${labelB} use different Credit Support Annex forms — ${labelA} uses the ${csaStructureShortLabel(
          structureA
        )} CSA, while ${labelB} uses the ${csaStructureShortLabel(
          structureB
        )} CSA. These are structurally different documents, not two versions of the same one: the elections below that genuinely exist under both are shown as a redline together; elections that only exist under one CSA form are grouped separately by structure rather than numbered as if they belonged to a single Paragraph 13.`,
      ]
    : [`Both ${labelA} and ${labelB} use the ${csaStructureShortLabel(structureA)} CSA.`];

  merged.csa = {
    title: docA.csa.title,
    introParagraphs: csaIntro,
    items: csaMerge.shared,
    onlyInAItems: csaMerge.onlyInA,
    onlyInBItems: csaMerge.onlyInB,
    onlyInALabel: `Elections specific to Current (${labelA}) — ${csaStructureShortLabel(structureA)}`,
    onlyInBLabel: `Elections specific to Comparison (${labelB}) — ${csaStructureShortLabel(structureB)}`,
    structureMismatch,
  };
  // Text is already fully resolved (both docA/docB ran resolveCrossReferences
  // themselves); only marker POSITIONS need recomputing here, since the
  // shared CSA items keep a normal lettered sequence while the structure-
  // specific groups are deliberately left unlettered (see assignMarkers,
  // which only touches doc.csa.items — onlyInAItems/onlyInBItems are never
  // assigned a marker at all).
  return assignMarkers(merged);
}

function scenarioNameForId(id) {
  if (!id || id === "blank") return "the blank configuration";
  if (id.startsWith("custom:")) {
    const cs = loadCustomScenarios().find((c) => `custom:${c.id}` === id);
    return cs ? cs.name : "a custom scenario";
  }
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? preset.name : "an unknown scenario";
}

function generateScheduleRedlineOutputs(targetId) {
  const target = resolveScenarioById(targetId);
  const currentLabel = "the current configuration";
  const targetLabel = scenarioNameForId(targetId);
  const doc = buildScheduleRedlineDocument(STATE.config, STATE.dealDetails, target.config, {}, currentLabel, targetLabel);
  const markdown = renderScheduleMarkdown(doc);
  const docxBlob = buildDocxBlob(scheduleDocToDocxBlocks(doc), { title: "ISDA Schedule Redline", creator: "ISDA Master Agreement Jigsaw" });
  return {
    markdown,
    docxBlob,
    targetLabel,
    structureMismatch: doc.csa.structureMismatch,
    structureALabel: csaStructureShortLabel(STATE.config.attachments.csaStructure),
    structureBLabel: csaStructureShortLabel(target.config.attachments.csaStructure),
  };
}

/* ---------------------------------------------------------------------- */
/* 12. ELECTIONS SUMMARY — short, visual, "changes only" markdown         */
/* ---------------------------------------------------------------------- */

function fieldChangedFromDefault(cat, field, config) {
  return JSON.stringify(config[cat][field.key]) !== JSON.stringify(field.default);
}

function generateElectionsSummaryMarkdown() {
  const config = STATE.config;
  const lines = [`# Elections Summary`, `*${currentScenarioLabel()}*`, ""];
  const score = computeRiskScore(config);
  const scoreLabel = score > 15 ? "Dealer-favorable" : score < -15 ? "Buy-side-favorable" : "Roughly balanced";
  lines.push(`> **Risk Balance:** ${scoreLabel} (score ${score}; -100 = strongly buy-side, +100 = strongly dealer)`);
  lines.push("");

  let anyChanges = false;
  CATEGORY_ORDER.forEach((cat) => {
    const rows = [];
    PIECES[cat].fields.forEach((f) => {
      if (!conditionalMatch(f, config, cat)) return;
      if (!fieldChangedFromDefault(cat, f, config)) return;
      const leanTag = fieldPieceLean(cat, f).css.replace("lean-", "");
      rows.push([f.label, fieldValueDisplayFor(config, cat, f).replace(/\|/g, "/"), LEAN_TAG_LABELS[leanTag] || "Neutral"]);
    });
    if (!rows.length) return;
    anyChanges = true;
    lines.push(`## ${PIECES[cat].label}`);
    lines.push("");
    lines.push("| Election | Selection | Leans |");
    lines.push("| --- | --- | --- |");
    rows.forEach((r) => lines.push(`| ${r[0]} | ${r[1]} | ${r[2]} |`));
    lines.push("");
  });

  if (!anyChanges) {
    lines.push("*No elections currently depart from this tool's defaults — this configuration is the plain-vanilla baseline.*");
    lines.push("");
  }

  lines.push("---");
  lines.push("*Reflects only elections that depart from this tool's defaults. Semi-parodical educational tool — not legal advice.*");
  return lines.join("\n");
}

/* ---------------------------------------------------------------------- */
/* 13. MARKDOWN OUTPUT DISPLAY — minimal renderer for self-generated MD    */
/* ---------------------------------------------------------------------- */

function htmlEscape(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function mdInline(str) {
  return htmlEscape(str)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, '<del class="redline-del">$1</del>')
    .replace(/\+\+(.+?)\+\+/g, '<ins class="redline-ins">$1</ins>')
    .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}

function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,3}\s+/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${mdInline(line.replace(/^#{1,3}\s+/, ""))}</h${level}>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      const quoted = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${quoted.map((l) => `<p>${mdInline(l)}</p>`).join("")}</blockquote>`);
      continue;
    }
    if (/^\|/.test(line)) {
      closeList();
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !/^\|\s*-+\s*\|/.test(l.replace(/\s/g, "")) && !/^(\|\s*-+\s*)+\|$/.test(l))
        .map((l) =>
          l
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim())
        );
      const [headerRow, ...bodyRows] = rows;
      out.push(
        '<table class="md-table"><thead><tr>' +
          (headerRow || []).map((c) => `<th>${mdInline(c)}</th>`).join("") +
          "</tr></thead><tbody>" +
          bodyRows.map((r) => "<tr>" + r.map((c) => `<td>${mdInline(c)}</td>`).join("") + "</tr>").join("") +
          "</tbody></table>"
      );
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      closeList();
      out.push("<hr/>");
      i++;
      continue;
    }
    if (/^-\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${mdInline(line.replace(/^-\s+/, ""))}</li>`);
      i++;
      continue;
    }
    closeList();
    if (line.trim() === "") {
      i++;
      continue;
    }
    out.push(`<p>${mdInline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}

function downloadBlobObject(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showMarkdownOutput(title, markdownText, opts) {
  opts = opts || {};
  document.getElementById("outputTitle").textContent = title;
  document.getElementById("outputSubtitle").textContent = currentScenarioLabel();
  const body = document.getElementById("outputBody");
  body.innerHTML = `${opts.warningHtml || ""}<div class="output-content md-rendered">${mdToHtml(markdownText)}</div>`;
  document.getElementById("outputOverlay").classList.remove("hidden");

  const overlay = document.getElementById("outputOverlay");
  overlay.dataset.copyText = markdownText;
  overlay.dataset.downloadName = `${slugify(title)}.md`;
  overlay.dataset.downloadMime = "text/markdown";
  overlay.dataset.downloadContent = markdownText;

  const docxBtn = document.getElementById("outputDownloadDocx");
  if (opts.docxBlob) {
    docxBtn.classList.remove("hidden");
    docxBtn.onclick = () => downloadBlobObject(opts.docxFilename || `${slugify(title)}.docx`, opts.docxBlob);
  } else {
    docxBtn.classList.add("hidden");
    docxBtn.onclick = null;
  }
  // btnSchedule's own click handler drives the redline row directly (it
  // needs to populate/show it before the first render); every other caller
  // of showMarkdownOutput — Elections Summary, or a redline re-render caused
  // by the row's own <select> changing — must not blow that row away.
  if (!opts.keepRedlineRow) document.getElementById("scheduleRedlineRow").classList.add("hidden");
}

function renderScheduleOutput(targetId) {
  if (!targetId || targetId === "__none__") {
    const { markdown, docxBlob } = generateScheduleOutputs();
    showMarkdownOutput("ISDA Schedule & CSA", markdown, {
      docxBlob,
      docxFilename: "isda-schedule-and-csa.docx",
      keepRedlineRow: true,
      warningHtml: modeWarningHtml("ignoresFilters"),
    });
    return;
  }
  const { markdown, docxBlob, targetLabel, structureMismatch, structureALabel, structureBLabel } = generateScheduleRedlineOutputs(targetId);
  showMarkdownOutput(`ISDA Schedule & CSA — Redline vs. ${targetLabel}`, markdown, {
    docxBlob,
    docxFilename: "isda-schedule-redline.docx",
    keepRedlineRow: true,
    warningHtml: modeWarningHtml("ignoresFilters") + csaStructureMismatchWarningHtml(structureMismatch, structureALabel, structureBLabel),
  });
}

function populateScheduleRedlineSelect() {
  const select = document.getElementById("scheduleRedlineSelect");
  select.innerHTML = "";
  const none = document.createElement("option");
  none.value = "__none__";
  none.textContent = "None (plain Schedule)";
  select.appendChild(none);
  PRESETS.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    select.appendChild(o);
  });
  const customScenarios = loadCustomScenarios();
  if (customScenarios.length) {
    const group = document.createElement("optgroup");
    group.label = "My Custom Scenarios";
    customScenarios.forEach((cs) => {
      const o = document.createElement("option");
      o.value = `custom:${cs.id}`;
      o.textContent = cs.name;
      group.appendChild(o);
    });
    select.appendChild(group);
  }
  select.value = "__none__";
}

/* ---------------------------------------------------------------------- */
/* 14. DEAL DETAILS — optional preamble fill-ins for the Schedule          */
/* ---------------------------------------------------------------------- */

function openDealDetailsModal() {
  document.getElementById("dealDetailsDealerName").value = STATE.dealDetails.dealerName || "";
  document.getElementById("dealDetailsCounterpartyName").value = STATE.dealDetails.counterpartyName || "";
  document.getElementById("dealDetailsAgreementDate").value = STATE.dealDetails.agreementDate || "";
  document.getElementById("dealDetailsOverlay").classList.remove("hidden");
}

function closeDealDetailsModal() {
  document.getElementById("dealDetailsOverlay").classList.add("hidden");
}

function saveDealDetails() {
  STATE.dealDetails = {
    dealerName: document.getElementById("dealDetailsDealerName").value.trim(),
    counterpartyName: document.getElementById("dealDetailsCounterpartyName").value.trim(),
    agreementDate: document.getElementById("dealDetailsAgreementDate").value,
  };
  saveState();
  closeDealDetailsModal();
}

/* ---------------------------------------------------------------------- */
/* 15. WIRING                                                             */
/* ---------------------------------------------------------------------- */

function init() {
  loadState();
  populatePresetSelect();
  document.getElementById("vanillaModeToggle").checked = !!STATE.vanillaMode;
  document.getElementById("vanillaScopeSelect").value = STATE.vanillaScope;
  document.getElementById("vanillaScopeWrap").classList.toggle("visible", !!STATE.vanillaMode);
  updateFocusButtonLabel();
  updatePracticeBar();
  updateMatterBar();
  populateGuardrailsSelect();
  populateFavorabilitySelect();
  renderAll();

  // Tap-to-dismiss for the custom tooltip on touch devices: any click that
  // didn't land on a tooltip-bearing badge/tag (those stopPropagation on
  // their own click) closes whatever tooltip is currently open.
  document.addEventListener("click", hideCustomTooltip);

  document.getElementById("presetSelect").addEventListener("change", (e) => applyPreset(e.target.value));

  document.getElementById("vanillaModeToggle").addEventListener("change", (e) => {
    STATE.vanillaMode = e.target.checked;
    document.getElementById("vanillaScopeWrap").classList.toggle("visible", !!STATE.vanillaMode);
    renderAll();
  });

  document.getElementById("vanillaScopeSelect").addEventListener("change", (e) => {
    STATE.vanillaScope = e.target.value;
    renderAll();
  });

  document.getElementById("focusModeBtn").addEventListener("click", openFocusModal);
  document.getElementById("focusClose").addEventListener("click", closeFocusModal);
  document.getElementById("focusCancel").addEventListener("click", closeFocusModal);
  document.getElementById("focusOverlay").addEventListener("click", (e) => {
    if (e.target.id === "focusOverlay") closeFocusModal();
  });
  document.getElementById("focusSelectAll").addEventListener("click", () => {
    document.querySelectorAll(".focus-field-input").forEach((cb) => (cb.checked = true));
  });
  document.getElementById("focusSelectNone").addEventListener("click", () => {
    document.querySelectorAll(".focus-field-input").forEach((cb) => (cb.checked = false));
  });
  document.getElementById("focusShowAll").addEventListener("click", () => {
    STATE.focusFields = null;
    closeFocusModal();
    updateFocusButtonLabel();
    renderAll();
  });
  document.getElementById("focusApply").addEventListener("click", applyFocusSelection);

  document.getElementById("helpBtn").addEventListener("click", openTutorial);
  document.getElementById("tutorialSkip").addEventListener("click", closeTutorial);
  document.getElementById("tutorialOverlay").addEventListener("click", (e) => {
    if (e.target.id === "tutorialOverlay") closeTutorial();
  });
  document.getElementById("tutorialBack").addEventListener("click", () => {
    if (tutorialStepIndex > 0) {
      tutorialStepIndex--;
      renderTutorialStep();
    }
  });
  document.getElementById("tutorialNext").addEventListener("click", () => {
    if (tutorialStepIndex < TUTORIAL_STEPS.length - 1) {
      tutorialStepIndex++;
      renderTutorialStep();
    } else {
      closeTutorial();
    }
  });
  let tutorialSeen = true;
  try {
    tutorialSeen = !!localStorage.getItem(TUTORIAL_SEEN_KEY);
  } catch (e) {
    /* storage unavailable */
  }
  if (!tutorialSeen) openTutorial();

  updateHistoryButtons();
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);

  document.getElementById("compareBtn").addEventListener("click", openCompareModal);
  document.getElementById("compareClose").addEventListener("click", () => {
    document.getElementById("compareOverlay").classList.add("hidden");
  });
  document.getElementById("compareDone").addEventListener("click", () => {
    document.getElementById("compareOverlay").classList.add("hidden");
  });
  document.getElementById("compareOverlay").addEventListener("click", (e) => {
    if (e.target.id === "compareOverlay") document.getElementById("compareOverlay").classList.add("hidden");
  });
  document.getElementById("compareTargetSelect").addEventListener("change", runComparison);

  document.getElementById("practiceBtn").addEventListener("click", openPracticeModal);
  document.getElementById("practiceClose").addEventListener("click", () => {
    document.getElementById("practiceOverlay").classList.add("hidden");
  });
  document.getElementById("practiceCancel").addEventListener("click", () => {
    document.getElementById("practiceOverlay").classList.add("hidden");
  });
  document.getElementById("practiceOverlay").addEventListener("click", (e) => {
    if (e.target.id === "practiceOverlay") document.getElementById("practiceOverlay").classList.add("hidden");
  });
  document.getElementById("practiceMandateBtn").addEventListener("click", () => {
    window.alert(practiceMandateText());
  });
  document.getElementById("practiceScoreBtn").addEventListener("click", openPracticeScoreModal);
  document.getElementById("practiceEndBtn").addEventListener("click", endPractice);
  document.getElementById("practiceScoreClose").addEventListener("click", () => {
    document.getElementById("practiceScoreOverlay").classList.add("hidden");
  });
  document.getElementById("practiceScoreDone").addEventListener("click", () => {
    document.getElementById("practiceScoreOverlay").classList.add("hidden");
  });
  document.getElementById("practiceScoreOverlay").addEventListener("click", (e) => {
    if (e.target.id === "practiceScoreOverlay") document.getElementById("practiceScoreOverlay").classList.add("hidden");
  });

  document.getElementById("stressTestBtn").addEventListener("click", openStressTestModal);
  document.getElementById("stressTestClose").addEventListener("click", () => {
    document.getElementById("stressTestOverlay").classList.add("hidden");
  });
  document.getElementById("stressTestDone").addEventListener("click", () => {
    document.getElementById("stressTestOverlay").classList.add("hidden");
  });
  document.getElementById("stressTestOverlay").addEventListener("click", (e) => {
    if (e.target.id === "stressTestOverlay") document.getElementById("stressTestOverlay").classList.add("hidden");
  });
  document.getElementById("stressEventSelect").addEventListener("change", renderStressEventInputs);
  document.getElementById("stressRunBtn").addEventListener("click", runStressTest);

  document.getElementById("resetBtn").addEventListener("click", () => {
    endGuardrails();
    endFavorabilityRuleset();
    applyPreset("blank");
    document.getElementById("presetSelect").value = "blank";
  });

  document.getElementById("saveScenarioBtn").addEventListener("click", handleSaveScenario);
  document.getElementById("exportJsonBtn").addEventListener("click", handleExportJson);

  // ---- Import (single entry point, three kinds) ----
  // "Import…" opens a modal explaining the three import kinds side by side
  // (they read the same exported-JSON shape but do very different things —
  // see the modal copy in index.html), each option then triggers its own
  // existing hidden file input exactly as the old dedicated buttons did.
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importOverlay").classList.remove("hidden");
  });
  document.getElementById("importClose").addEventListener("click", () => {
    document.getElementById("importOverlay").classList.add("hidden");
  });
  document.getElementById("importDone").addEventListener("click", () => {
    document.getElementById("importOverlay").classList.add("hidden");
  });
  document.getElementById("importOverlay").addEventListener("click", (e) => {
    if (e.target.id === "importOverlay") document.getElementById("importOverlay").classList.add("hidden");
  });
  document.getElementById("importJsonOption").addEventListener("click", () => {
    document.getElementById("importOverlay").classList.add("hidden");
    document.getElementById("importJsonInput").click();
  });
  document.getElementById("importJsonInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportJsonFile(file);
    e.target.value = "";
  });

  document.getElementById("importPlaybookOption").addEventListener("click", () => {
    document.getElementById("importOverlay").classList.add("hidden");
    document.getElementById("importPlaybookInput").click();
  });
  document.getElementById("importPlaybookInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportPlaybookFile(file);
    e.target.value = "";
  });

  // ---- Matters ----
  document.getElementById("mattersBtn").addEventListener("click", openMattersModal);
  document.getElementById("mattersClose").addEventListener("click", () => {
    document.getElementById("mattersOverlay").classList.add("hidden");
  });
  document.getElementById("mattersDone").addEventListener("click", () => {
    document.getElementById("mattersOverlay").classList.add("hidden");
  });
  document.getElementById("mattersOverlay").addEventListener("click", (e) => {
    if (e.target.id === "mattersOverlay") document.getElementById("mattersOverlay").classList.add("hidden");
  });
  document.getElementById("newMatterBtn").addEventListener("click", handleCreateMatter);
  document.getElementById("matterCloseBtn").addEventListener("click", endMatterMode);
  document.getElementById("matterSaveRoundBtn").addEventListener("click", () => {
    const label = window.prompt('Label this round (e.g., "Draft 2 — after their comments"):', "");
    if (label === null) return; // cancelled
    saveNewMatterRound(label);
  });
  document.getElementById("matterHistoryBtn").addEventListener("click", openMatterHistoryModal);
  document.getElementById("matterHistoryClose").addEventListener("click", () => {
    document.getElementById("matterHistoryOverlay").classList.add("hidden");
  });
  document.getElementById("matterHistoryDone").addEventListener("click", () => {
    document.getElementById("matterHistoryOverlay").classList.add("hidden");
  });
  document.getElementById("matterHistoryOverlay").addEventListener("click", (e) => {
    if (e.target.id === "matterHistoryOverlay") document.getElementById("matterHistoryOverlay").classList.add("hidden");
  });
  document.getElementById("matterChecklistBtn").addEventListener("click", openMatterChecklistModal);
  document.getElementById("matterChecklistClose").addEventListener("click", () => {
    document.getElementById("matterChecklistOverlay").classList.add("hidden");
  });
  document.getElementById("matterChecklistDone").addEventListener("click", () => {
    document.getElementById("matterChecklistOverlay").classList.add("hidden");
  });
  document.getElementById("matterChecklistOverlay").addEventListener("click", (e) => {
    if (e.target.id === "matterChecklistOverlay") document.getElementById("matterChecklistOverlay").classList.add("hidden");
  });

  // ---- Playbook Guardrails ----
  document.getElementById("importGuardrailsOption").addEventListener("click", () => {
    document.getElementById("importOverlay").classList.add("hidden");
    document.getElementById("importGuardrailsInput").click();
  });
  document.getElementById("importGuardrailsInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportGuardrailsFile(file);
    e.target.value = "";
  });
  document.getElementById("guardrailsSelect").addEventListener("change", (e) => {
    STATE.playbookId = e.target.value || null;
    renderAll();
  });

  // ---- Favorability Rulesets ----
  document.getElementById("importFavorabilityOption").addEventListener("click", () => {
    document.getElementById("importOverlay").classList.add("hidden");
    document.getElementById("importFavorabilityInput").click();
  });
  document.getElementById("importFavorabilityInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportFavorabilityFile(file);
    e.target.value = "";
  });
  document.getElementById("favorabilitySelect").addEventListener("change", (e) => {
    STATE.favorabilityRulesetId = e.target.value || null;
    renderAll();
  });

  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modalSave").addEventListener("click", saveModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  document.getElementById("outputClose").addEventListener("click", () => {
    document.getElementById("outputOverlay").classList.add("hidden");
  });
  document.getElementById("outputDone").addEventListener("click", () => {
    document.getElementById("outputOverlay").classList.add("hidden");
  });
  document.getElementById("outputOverlay").addEventListener("click", (e) => {
    if (e.target.id === "outputOverlay") document.getElementById("outputOverlay").classList.add("hidden");
  });
  document.getElementById("outputCopy").addEventListener("click", () => {
    const text = document.getElementById("outputOverlay").dataset.copyText || "";
    if (navigator.clipboard && text) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  });
  document.getElementById("outputDownload").addEventListener("click", () => {
    const overlay = document.getElementById("outputOverlay");
    const { downloadName, downloadMime, downloadContent } = overlay.dataset;
    if (downloadContent) downloadBlob(downloadName, downloadMime, downloadContent);
  });
  document.getElementById("outputPrint").addEventListener("click", () => {
    // Every modern browser's print dialog offers "Save as PDF" as a printer
    // destination — that's the PDF export path here. The only thing worth
    // doing in JS is giving the resulting file a sensible suggested name,
    // since browsers default the PDF filename to document.title.
    const overlay = document.getElementById("outputOverlay");
    const suggestedName = (overlay.dataset.downloadName || "isda-jigsaw-output").replace(/\.(txt|csv|md|docx)$/, "");
    const previousTitle = document.title;
    document.title = suggestedName;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  });

  document.getElementById("btnTermSheet").addEventListener("click", () => {
    showTextOutput("Executable Term Sheet", generateTermSheet());
  });
  document.getElementById("btnFallback").addEventListener("click", () => {
    const rows = generateFallbackMatrix();
    showTableOutput("Fallback Matrix", rows, [
      { key: "piece", header: "Piece", showLean: true },
      { key: "target", header: "Target Position" },
      { key: "fallback", header: "Acceptable Fallback", tone: "caution" },
      { key: "walkaway", header: "Walkaway Limit", tone: "danger" },
    ]);
  });
  document.getElementById("btnDefense").addEventListener("click", () => {
    const rows = generateDefenseGuide();
    showTableOutput("Counterparty Defense Guide", rows, [
      { key: "piece", header: "Piece", showLean: true },
      { key: "currentPosition", header: "Current Position" },
      { key: "pushback", header: "Anticipated Pushback", tone: "danger" },
      { key: "counter", header: "Counter-Argument", tone: "resolution" },
    ]);
  });
  document.getElementById("btnSchedule").addEventListener("click", () => {
    populateScheduleRedlineSelect();
    document.getElementById("scheduleRedlineRow").classList.remove("hidden");
    renderScheduleOutput("__none__");
  });
  document.getElementById("scheduleRedlineSelect").addEventListener("change", (e) => renderScheduleOutput(e.target.value));
  document.getElementById("btnSummary").addEventListener("click", () => {
    showMarkdownOutput("Elections Summary", generateElectionsSummaryMarkdown(), { warningHtml: modeWarningHtml("ignoresFilters") });
  });

  document.getElementById("dealDetailsBtn").addEventListener("click", openDealDetailsModal);
  document.getElementById("dealDetailsClose").addEventListener("click", closeDealDetailsModal);
  document.getElementById("dealDetailsCancel").addEventListener("click", closeDealDetailsModal);
  document.getElementById("dealDetailsOverlay").addEventListener("click", (e) => {
    if (e.target.id === "dealDetailsOverlay") closeDealDetailsModal();
  });
  document.getElementById("dealDetailsSave").addEventListener("click", saveDealDetails);
}

document.addEventListener("DOMContentLoaded", init);
