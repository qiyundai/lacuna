const activities = {
  water: /\b(?:swam|swimming|(?:went|go|going) (?:for )?(?:a )?swim|(?:dawn|morning|evening|lake|river|ocean) swim|(?:swim|swims) (?:at|in|across|before|after|every)|kayak(?:ed|ing)|canoe(?:d|ing)|paddl(?:ed|ing) (?:a |the |our |my )?(?:canoe|kayak|boat)|(?:swam|did) (?:\w+ )?laps)\b/g,
  travel: /\b(?:(?:walk(?:ed|ing)?|cycl(?:ed|ing)|bik(?:ed|ing)) (?:home|to|along|through|across|around|the long way)|(?:caught|took|rode|boarded|missed) (?:a|the|my|our) (?:\w+ )?(?:bus|train|ferry|tram)|(?:morning|evening|last) (?:train|bus|ferry)|walked the long way)\b/g,
  meals: /\b(?:(?:made|brewed|had|shared|drank) (?:some |a cup of )?(?:tea|coffee)|(?:cook(?:ed|ing)|bak(?:ed|ing)) (?:\w+ ){0,2}(?:bread|soup|pasta|rice|cake|dinner)|(?:had|made|shared|ate|prepared) (?:breakfast|lunch|dinner|supper)|(?:breakfast|dinner|lunch) (?:on the|with|at home))\b/g,
  making: /\b(?:repair(?:ed|ing)|fix(?:ed|ing)|mend(?:ed|ing)|sand(?:ed|ing)|sew(?:ed|ing)) (?:\w+ ){0,3}(?:hinge|canoe|radio|bike|chair|jacket|coat|sock|socks|shelf|table|gate|handle|button|sleeve|paddle|cabinet|door)\b/g,
  growing: /\b(?:(?:plant(?:ed|ing)|repot(?:ted|ting)|water(?:ed|ing)|sow(?:ed|ing)|prun(?:ed|ing)) (?:\w+ ){0,3}(?:basil|mint|thyme|seeds|flowers|plants|fern|tomatoes|beans|garden|roses|seedlings|herbs)|weed(?:ed|ing) (?:\w+ ){0,2}(?:beds|garden|plot))\b/g,
  gathering: /\b(?:(?:met|visited|invited|joined) (?:up with )?(?:my|a|our|some) (?:family|friends?|sister|brother|neighbou?rs?)|(?:friends?|sister|brother|neighbou?rs?) (?:came over|stopped by)|(?:long|quiet|good) conversation|(?:we|friends and i) played (?:cards|chess|board games)|(?:race[d]?|swam|walked|ate|paddled) with (?:my |our )?(?:friends?|family|sister|brother))\b/g,
  reading: /\b(?:(?:read|reading|finished|reread) (?:\w+ ){0,2}(?:chapter|book|novel|poem)|book fell open|listen(?:ed|ing) to (?:\w+ ){0,2}(?:radio|music|record|song|album)|put on (?:a|the) record|heard a song)\b/g
};

export type Activity = keyof typeof activities;
export type SceneCues = {activities: Activity[]; early: boolean; company: boolean; outdoors: boolean};
const families = Object.keys(activities) as Activity[];
const withheld = /\b(?:not|never|no|without|hardly|instead of|wish(?:ed)?|if|wanted to|could have|thought about|dream(?:ed|t) (?:of|about)|plan(?:ned)? to|hop(?:e|ed) to)\b(?:\s+\w+){0,7}\s*$/;
const idioms = /\b(?:swimming in (?:debt|money|work|paperwork)|(?:head|room|eyes|numbers|words) (?:was |were |is |are )?(?:swam|swimming)|swam (?:before my eyes|into (?:view|focus))|train of thought|bus of thought|read (?:\w+ ){0,2}like a book)\b/g;

export function recognizeScene(body: string): SceneCues {
  const found = new Set<Activity>();
  let early = false, company = false, outdoors = false;
  const text = body.toLowerCase().replace(/[’‘]/g, "'").replace(/n't\b/g, ' not').replace(idioms, ' ');
  for (const clause of text.split(/[.!?;,\n]+|\b(?:but|then|instead i)\b/)) {
    let matched = false;
    for (const family of families) {
      for (const hit of clause.matchAll(activities[family])) {
        if (withheld.test(clause.slice(Math.max(0, hit.index - 100), hit.index))) continue;
        found.add(family);
        matched = true;
        break;
      }
    }
    if (matched) {
      early ||= /\b(?:dawn|sunrise|daybreak|early morning|before the alarm)\b/.test(clause);
      company ||= /\b(?:together|with (?:my |our |a )?(?:friends?|sister|brother|family)|we)\b/.test(clause);
      outdoors ||= /\b(?:outdoors|outside|riverbank|towpath|on the steps|in the garden|on the porch)\b/.test(clause);
    }
  }
  return {activities: [...found], early, company, outdoors};
}
