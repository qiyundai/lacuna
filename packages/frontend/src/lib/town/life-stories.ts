import type { Architecture } from './architecture-catalog.js';
import type { RiverDistrict } from './river-neighborhoods.js';

export interface LifeStory {
  key:string; model:string; stride:number; title:string; district:RiverDistrict; venues:Architecture[]; keepsake:string;
  correspondent:string; recollection:string; detail:string; past:string; promise:string; errand:string; calls:{venues:Architecture[];task:string}[]; chapters:string[]; notes:string[];
}

export const lifeStories:LifeStory[] = [
  {
    "key": "seeds",
    "model": "seed-gardener.glb", "stride": 1,
    "recollection": "The year the garden failed, one marigold flowered in the spout of an old kettle. The kettle spent the winter inside on the draining board.",
    "detail": "“Don't tell me the color,” the last birthday letter said. “I want to meet it when it opens.” A little space is left on each envelope now for whatever comes back.",
    "title": "The envelope garden",
    "district": "gardens",
    "venues": [
      "glasshouse",
      "orangery"
    ],
    "keepsake": "seed envelopes",
    "correspondent": "Mira",
    "past": "sent three marigolds to a cousin in a letter. Only the stems survived the sorting office.",
    "promise": "A seed could make the same journey alive. Mira still has the envelope with the orange dust in its corners.",
    "calls": [
      {"venues":["postOffice","cottages"],"task":"Addressing birthday seed packets"},
      {"venues":["market","tearoom"],"task":"Trading news of the seedlings"}
    ],
    "errand": "Delivering seed packets",
    "chapters": [
      "A seed rattled inside the first dry head.",
      "Three packets came back with drawings of the flowers.",
      "The last packet grew in a stranger’s boot on a windowsill.",
      "Mira hung a swap drawer outside the kitchen."
    ],
    "notes": [
      "A teacup counts as a garden.",
      "Save the head that rattles.",
      "Blue ink runs when wet.",
      "Leave one bloom for the bees.",
      "Small packet, tallest stem.",
      "A thumb is a good measure.",
      "Birthday stamps cost one stem each."
    ]
  },
  {
    "key": "atlas",
    "model": "cartographer.glb", "stride": 1.23,
    "recollection": "Childhood journeys were counted by the sounds of the streets. The longest road had a loose iron cover that rang in two different keys.",
    "detail": "There is already a perfectly serviceable map in the kitchen. Its blue line runs straight through the spot where footsteps suddenly sound as though they belong to somebody walking underneath.",
    "title": "The map you can hear",
    "district": "civic",
    "venues": [
      "belfry",
      "station",
      "musicHall"
    ],
    "keepsake": "folding map",
    "correspondent": "Tavi",
    "past": "once led a lost uncle home through fog by counting the echoes off the quay wall.",
    "promise": "Tavi still says the best turnings can be heard before they can be seen. The two are making a map for ears.",
    "calls": [
      {"venues":["wharf","arches"],"task":"Timing the echo under the boards"},
      {"venues":["bindery","library"],"task":"Folding the newest map sheet"}
    ],
    "errand": "Listening for a familiar sound",
    "chapters": [
      "The first turning went down as two short strokes.",
      "A neighbor followed the pencil marks with closed eyes and found the wrong door.",
      "A public listening walk ended with everyone at the same door.",
      "Tavi can now follow the route from a recording alone."
    ],
    "notes": [
      "Draw the echo twice.",
      "Pencil squeaks in the rain.",
      "The gull is an unreliable landmark.",
      "Four notes at the corner.",
      "Leave room for silence.",
      "Boot heels sound different on oak.",
      "Fold along the street."
    ]
  },
  {
    "key": "mending",
    "model": "bench-repairer.glb", "stride": 0.83,
    "recollection": "The first repair job was a bread-bin catch. It took an afternoon and a bent teaspoon. That bread bin is still in use.",
    "detail": "The price of a loan is the story of the thing that broke. Yesterday someone described a cupboard door as “the stubborn one.” That went on the label alongside the size of its hinge.",
    "title": "The drawer of spare parts",
    "district": "works",
    "venues": [
      "cooperage",
      "clockmaker",
      "warehouse"
    ],
    "keepsake": "brass parts tin",
    "correspondent": "Sol",
    "past": "spent a winter taking a wind-up bird apart. Its last spring shot into the bread bin.",
    "promise": "Sol found it months later. They saved the bird and began saving all the little things a repair might need.",
    "calls": [
      {"venues":["market","boathouse"],"task":"Returning a borrowed spanner"},
      {"venues":["clockmaker","pottery"],"task":"Looking for the missing right hinge"}
    ],
    "errand": "Matching a worn fitting",
    "chapters": [
      "A button tin became a drawer for odd screws.",
      "A pencilled outline led to a match for a missing hinge.",
      "The lending counter issued its first numbered tin.",
      "Sol left a box of spare hinges on the doorstep for anyone to borrow."
    ],
    "notes": [
      "Two left hinges.",
      "File only the bright edge.",
      "Feed the bird one turn.",
      "Keep a magnet in the lid.",
      "A washer fits the old key.",
      "Save the broken half.",
      "Oil stains make good fingerprints."
    ]
  },
  {
    "key": "table",
    "model": "supper-host.glb", "stride": 0.92,
    "recollection": "A blue darn on the best tablecloth marks the place where a birthday candle once fell over. Every year somebody remembers whose birthday it was differently.",
    "detail": "Invitations have a space for a dish and a space for who taught you to make it. One came back with nothing in the first space and “ask my brother” written very firmly in the second.",
    "title": "One more chair",
    "district": "exchange",
    "venues": [
      "bakery",
      "market",
      "pottery"
    ],
    "keepsake": "chipped serving bowl",
    "correspondent": "Nellie",
    "past": "learned to balance a door across two crates when supper guests outnumbered the chairs.",
    "promise": "Nellie kept the old door after the move. Its blue paint still marks the underside of every tablecloth.",
    "calls": [
      {"venues":["postOffice","civic"],"task":"Delivering a supper invitation"},
      {"venues":["pottery","tearoom"],"task":"Counting out borrowed bowls"}
    ],
    "errand": "Borrowing a serving bowl",
    "chapters": [
      "The guest list grew by one small pencilled name.",
      "A chipped bowl came home full of bread pudding.",
      "The supper became a standing invitation for the whole street.",
      "Nellie has started a smaller Sunday table for two."
    ],
    "notes": [
      "Keep the chipped bowl.",
      "Ask who taught the cook.",
      "One more chair.",
      "Two crates of equal height.",
      "Darn the blue patch.",
      "Bread heels hold more custard.",
      "Send the pot home full."
    ]
  },
  {
    "key": "archive",
    "model": "photo-archivist.glb", "stride": 1.16,
    "recollection": "A photograph in the hall always leaned to the left. When the frame finally came down, four more prints fell out. Only the dog's name was written on the backs.",
    "detail": "One print has a child's thumb over half the lens. Nobody wants to crop it. Whoever can remember being that height might also remember who handed them the camera.",
    "title": "Names on the backs",
    "district": "civic",
    "venues": [
      "postOffice",
      "library",
      "atelier"
    ],
    "keepsake": "photograph album",
    "correspondent": "Alma",
    "past": "inherited a box of photographs with dates on every print and names on none. A dog asleep under a chair was the first clue.",
    "promise": "Alma remembers its crooked ear. Together they are putting the names back while there is still time to ask.",
    "calls": [
      {"venues":["market","tearoom"],"task":"Asking who remembers the little dog"},
      {"venues":["station","wharf"],"task":"Handing over a family print"}
    ],
    "errand": "Comparing an old photograph",
    "chapters": [
      "Someone recognized the dog and supplied a family name.",
      "A soft pencil put the first three names on the back.",
      "A duplicate print was entrusted to a neighbor for delivery to the family.",
      "Alma cleared a wall for a kitchen exhibition of the named faces."
    ],
    "notes": [
      "Use the soft pencil.",
      "Who held the camera?",
      "The bucket belonged to Grandad.",
      "Never write on a face.",
      "Keep the torn corner.",
      "Dogs remember doorsteps.",
      "Make a second print."
    ]
  },
  {
    "key": "lights",
    "model": "lamplighter.glb", "stride": 1.05,
    "recollection": "On night shifts a window lamp was the last thing visible when fog swallowed the quay. Its old glass chimney has a shallow chip shaped like a crescent moon.",
    "detail": "The first test put a bright spot on the ceiling and left the table dark. The next one will be at eye level, with someone across the street raising a hand when the flame appears.",
    "title": "The lamp at half tide",
    "district": "works",
    "venues": [
      "beacon",
      "wharf",
      "station"
    ],
    "keepsake": "storm lantern",
    "correspondent": "Edda",
    "past": "kept a lamp in the upstairs window for a sibling who rowed home in the dark. One winter the wick smoked the glass black.",
    "promise": "Edda could see the light from the water and drew the beam on an envelope. They want the old lamp to throw that shape again.",
    "calls": [
      {"venues":["clockmaker","warehouse"],"task":"Measuring a fresh wick"},
      {"venues":["glasshouse","orangery"],"task":"Trying the lens against daylight"}
    ],
    "errand": "Testing the lantern glass",
    "chapters": [
      "The cleaned lens cast a crescent on the kitchen wall.",
      "A foil collar steadied the beam in a draught.",
      "The little lamp joined the evening watch.",
      "Edda hung it above the family landing."
    ],
    "notes": [
      "Trim at a slant.",
      "Soot comes off with paper.",
      "Turn the lens slowly.",
      "Listen for the rattle.",
      "Copper warms before glass.",
      "Save the last match.",
      "Window open one finger."
    ]
  },
  {
    "key": "kite",
    "model": "kite-maker.glb", "stride": 1.15,
    "recollection": "A childhood kite escaped over the roof, leaving only its ribbon behind. A dab of soup on the ribbon still marks its last indoor flight.",
    "detail": "A tally is drawn on the reel for every second the kite stays up. Twelve little strokes would go all the way round. So far the longest row ends just above the knot.",
    "title": "The kite with two tails",
    "district": "gardens",
    "venues": [
      "pines",
      "sailLoft",
      "wharf"
    ],
    "keepsake": "paper kite",
    "correspondent": "Bo",
    "past": "stitched a kite from an outgrown raincoat. It wheeled left every time and once landed in the soup.",
    "promise": "Bo mailed back a grease-stained scrap and a challenge to make it fly straight.",
    "calls": [
      {"venues":["atelier","bindery"],"task":"Looking for a length of ribbon"},
      {"venues":["station","terraces"],"task":"Reading the wind beside the flags"}
    ],
    "errand": "Testing the wind",
    "chapters": [
      "The short spar balanced on a thumbnail.",
      "A second tail kept the kite up for twelve breaths.",
      "A little flight school now meets when the flags lift.",
      "Bo is keeping the repaired kite for the first windy birthday."
    ],
    "notes": [
      "Shorten the left tail.",
      "Soup makes poor glue.",
      "Tie across the grain.",
      "Look at the washing line.",
      "Count twelve breaths.",
      "Keep a spare reel.",
      "Let the wind take it."
    ]
  },
  {
    "key": "bells",
    "model": "bell-ringer.glb", "stride": 0.96,
    "recollection": "A wooden music box survived a move in a flour sack. Its eighth bell did not. The little hook where it hung is still polished bright.",
    "detail": "Everyone remembers the lullaby at a different speed, but when they reach the missing note they pause for exactly the same length of time. That silence has become the measure.",
    "title": "The missing eighth note",
    "district": "civic",
    "venues": [
      "musicHall",
      "belfry",
      "pottery"
    ],
    "keepsake": "handbell",
    "correspondent": "Paz",
    "past": "owned seven little bells from a dismantled music box. A family lullaby always stopped one note early.",
    "promise": "Paz can sing the missing note exactly, but only with a mouth full of tea. They are trying to make it ring.",
    "calls": [
      {"venues":["clockmaker","cooperage"],"task":"Trying a softer clapper"},
      {"venues":["tearoom","cottages"],"task":"Listening to the last line of the lullaby"}
    ],
    "errand": "Comparing ringing notes",
    "chapters": [
      "A spoon gave the right pitch for half a second.",
      "A new clapper made the eighth note linger.",
      "The eight bells played the lullaby at an open rehearsal.",
      "Paz recorded the finished tune for the next baby in the family."
    ],
    "notes": [
      "Tea first.",
      "Seven bells, eight hooks.",
      "Felt damps the echo.",
      "Strike the rim lightly.",
      "Leave a breath before eight.",
      "Save the bent spoon.",
      "Listen after the silence."
    ]
  },
  {
    "key": "cloth",
    "model": "quilt-mender.glb", "stride": 0.93,
    "recollection": "Six addresses were sewn into a rain cape because the paper labels kept washing out. The name of the first street has worn away under the collar.",
    "detail": "Under a loose corner is a square of yellow gingham. It used to be a curtain. There is enough left to cover one more tear, provided nobody tries to make the edges straight.",
    "title": "A coat of many repairs",
    "district": "residential",
    "venues": [
      "atelier",
      "sailLoft",
      "market"
    ],
    "keepsake": "rolled patchwork",
    "correspondent": "Vera",
    "past": "wore the same rain cape through six moves. Every address left a patch in a different color.",
    "promise": "Vera saved the scraps and can still name the kitchen where each was cut. They want the next owner to know them too.",
    "calls": [
      {"venues":["library","postOffice"],"task":"Recording the names on the seams"},
      {"venues":["market","cottages"],"task":"Returning a borrowed square of gingham"}
    ],
    "errand": "Trading a square of cloth",
    "chapters": [
      "A red patch was traced to the first kitchen.",
      "Three patches acquired names embroidered on their seams.",
      "The cape went on loan with a little catalogue inside the pocket.",
      "Vera wears the cape again on wet mornings."
    ],
    "notes": [
      "Turn the seam inside.",
      "Red came first.",
      "Wax the thread.",
      "Leave room to grow.",
      "The pocket held a plum.",
      "Name the blue kitchen.",
      "One stitch for luck."
    ]
  },
  {
    "key": "tides",
    "model": "tide-watcher.glb", "stride": 1.13,
    "recollection": "A stopped watch once cost a whole morning at the landing. The nail on the post outside the kitchen went on telling the tide just as well as ever.",
    "detail": "There are two columns in the notebook, one for the water and one for where the ferry actually was. A coffee ring joins the entries on the only day they agreed to the minute.",
    "title": "A clock made of water",
    "district": "works",
    "venues": [
      "wharf",
      "boathouse",
      "observatory"
    ],
    "keepsake": "brass tide gauge",
    "correspondent": "Ivo",
    "past": "missed a ferry because a watch ran five minutes fast. The water mark on the landing had been perfectly right.",
    "promise": "Ivo scratched that mark onto a ruler. They want a kitchen clock that tells when to set out for the water.",
    "calls": [
      {"venues":["station","clockmaker"],"task":"Comparing the minute hands"},
      {"venues":["library","postOffice"],"task":"Copying the newest tide table"}
    ],
    "errand": "Taking a water reading",
    "chapters": [
      "The lowest mark finally dried enough to label.",
      "Three readings agreed within the width of a pencil.",
      "A second gauge went up for neighbors to read.",
      "Ivo fixed the original to the kitchen window."
    ],
    "notes": [
      "Read the wet edge.",
      "Count down from the nail.",
      "Pencil swells in rain.",
      "Subtract a thumb.",
      "The ferry came early.",
      "Brass keeps the scratch.",
      "Ask about spring tides."
    ]
  },
  {
    "key": "toys",
    "model": "boat-carver.glb", "stride": 0.95,
    "recollection": "At the first bath trial a toy boat went keel-up before its owner's sleeves were rolled. Upside down, it looked exactly like the chair leg it came from.",
    "detail": "Someone has suggested paint. That will have to wait. A painted hull would cover up the pencil line left by the small hand that drew where the water ought to reach.",
    "title": "A boat for the bath",
    "district": "residential",
    "venues": [
      "boathouse",
      "cooperage",
      "bathhouse"
    ],
    "keepsake": "wooden toy hull",
    "correspondent": "Lio",
    "past": "carved a toy boat from a chair leg for a niece. It sailed beautifully upside down.",
    "promise": "Lio photographed the first bath trial. The two keep the picture by the bench to remind them which side needs work.",
    "calls": [
      {"venues":["sailLoft","atelier"],"task":"Cutting a linen sail"},
      {"venues":["cottages","market"],"task":"Looking for a name for the boat"}
    ],
    "errand": "Floating the trial hull",
    "chapters": [
      "The hull floated level with a coin under the mast.",
      "A paper sail survived its first crossing of the washbasin.",
      "Copies of the little boat joined a neighborhood regatta.",
      "Lio wrapped the seaworthy original in the first bath towel."
    ],
    "notes": [
      "Plane with the grain.",
      "A coin for ballast.",
      "Save the soap dish.",
      "Blow gently.",
      "Name after launch.",
      "Dry the sail flat.",
      "Wrap it in the old towel."
    ]
  },
  {
    "key": "type",
    "model": "letterpress-printer.glb", "stride": 1.0,
    "recollection": "A whole box of lead letters spilled on the floor on moving day. A birthday card got printed anyway, with a little drawing wherever a letter was missing.",
    "detail": "The crooked e looks like it is leaning over to tell the next letter something. The straight replacement has been wrapped in paper and put away in case anyone ever asks for it.",
    "title": "The letter that leans",
    "district": "exchange",
    "venues": [
      "bindery",
      "library",
      "postOffice"
    ],
    "keepsake": "printer’s chase",
    "correspondent": "Rue",
    "past": "printed a birthday invitation with a crooked lowercase e. Every guest asked where the dancing letter came from.",
    "promise": "Rue saved that first invitation and wants the whole alphabet to have as much character.",
    "calls": [
      {"venues":["pottery","atelier"],"task":"Testing a fresh ink color"},
      {"venues":["market","civic"],"task":"Delivering a hand-printed invitation"}
    ],
    "errand": "Proofing a new letter",
    "chapters": [
      "A test print caught the lean of the old e.",
      "A neighbor traced a matching tail for the letter y.",
      "The first full alphabet printed a poster for the street.",
      "Rue received a birthday card set entirely in the new letters."
    ],
    "notes": [
      "Mind the mirror image.",
      "Ink the corners.",
      "Keep the dancing e.",
      "Dry on the line.",
      "A thumbprint is a signature.",
      "Set the y last.",
      "Save the first proof."
    ]
  }
];
