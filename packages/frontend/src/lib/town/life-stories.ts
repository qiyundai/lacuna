import type { Architecture } from './architecture-catalog.js';
import type { RiverDistrict } from './river-neighborhoods.js';

export interface LifeStory {
  workPose:[number,number,number,number,number]; tasks:[string,string,string,string];
  key:string; model:string; stride:number; title:string; district:RiverDistrict; venues:Architecture[]; keepsake:string;
  correspondent:string; recollection:string; detail:string; past:string; promise:string; errand:string; calls:{venues:Architecture[];task:string}[]; chapters:string[]; notes:string[];
}

export const lifeStories:LifeStory[] = [
  {
    "key": "seeds",
    "workPose": [-0.54, 0.32, 0.31, 0.17, 0.21],
    "tasks": ["Listening for ripe seed heads", "Folding the first envelopes", "Collecting drawings of last year’s flowers", "Handing out birthday seeds"],
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
    "workPose": [-0.92, 0.49, -0.21, -0.12, 0.1],
    "tasks": ["Listening for the first echo", "Walking the map with eyes closed", "Correcting the troublesome turning", "Sharing the listening map"],
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
    "workPose": [-0.78, -0.16, 0.51, 0.23, 0.74],
    "tasks": ["Sorting the fittings", "Tracing a missing hinge", "Trying the repaired latch", "Lending a tin of spare parts"],
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
    "workPose": [-0.66, 0.41, 0.64, 0.06, 0.16],
    "tasks": ["Counting the chairs", "Writing place cards", "Testing the bread pudding", "Collecting recipes after supper"],
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
    "workPose": [-1.08, 0.26, 0.15, 0.29, 0.12],
    "tasks": ["Sorting the photographs", "Pencilling a name beneath the dog", "Checking the family’s address", "Sharing copies of the named prints"],
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
    "workPose": [-1.34, -0.27, -0.12, -0.24, 0.2],
    "tasks": ["Trimming the wick", "Tracing the crescent of light", "Adjusting the foil collar", "Lighting the finished lamp"],
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
    "workPose": [-0.52, -0.68, -0.52, -0.32, 0.29],
    "tasks": ["Weighing the two spars", "Tying a second tail", "Timing the first steady flight", "Showing someone how to launch"],
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
    "workPose": [-0.91, 0.18, -0.27, -0.13, 0.72],
    "tasks": ["Listening for the eighth note", "Filing a new clapper", "Practising the last two bars", "Playing the complete lullaby"],
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
    "workPose": [-0.73, 0.47, 0.53, 0.22, 0.39],
    "tasks": ["Threading the needle", "Matching the red scrap", "Stitching names along the seams", "Showing the names inside the cape"],
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
    "workPose": [-1.12, -0.14, -0.16, -0.1, 0.13],
    "tasks": ["Checking the water mark", "Scribing a brass scale", "Comparing the last three readings", "Setting the tide gauge"],
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
    "workPose": [-0.57, 0.28, 0.48, 0.33, 0.51],
    "tasks": ["Checking the toy keel", "Moving the ballast", "Drying the first sail", "Launching the wooden boat"],
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
    "workPose": [-0.89, 0.38, 0.42, 0.26, 0.62],
    "tasks": ["Setting the dancing letter", "Pulling the first proof", "Cutting the last letter", "Inking the full alphabet"],
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
  },
  {
    "key": "glaze",
    "title": "The blue under the chip",
    "district": "works",
    "venues": ["pottery", "atelier"],
    "keepsake": "test saucer",
    "correspondent": "Bea",
    "past": "found a thumbprint in the blue glaze of a chipped cup. It fitted a thumb that had been gone for twenty years.",
    "recollection": "At home there was one cup that never went to guests. Its handle was ugly and its blue was the exact color the river turned just before rain.",
    "promise": "Bea has the handle. There is enough glaze on the broken edge to match one more cup.",
    "detail": "The trials fit in the empty spaces around other people's bowls. Each one comes out with a little stripe left bare for the date and the weather.",
    "errand": "Matching a fired glaze",
    "calls": [{"venues": ["tearoom", "market"], "task": "Holding the samples beside an old cup"}, {"venues": ["glasshouse", "orangery"], "task": "Comparing blues in daylight"}],
    "chapters": ["One saucer came out green enough to grow lettuce on.", "The thin end of the second test matched the old handle.", "Two blue cups came out of the same firing. One went straight on the kettle shelf.", "Bea recognized the blue before unwrapping the second cup."],
    "notes": ["The blue dries pink.", "Number the backs first.", "Ask for the chipped one.", "Try a thinner coat.", "The rainy tile goes on the left.", "Use the bottom shelf.", "Tea makes every blue darker."],
    "tasks": ["Sorting the fired samples", "Brushing a thinner test", "Checking the handle in daylight", "Wrapping the matching cups"],
    "stride": 0.88,
    "model": "kiln-potter.glb",
    "workPose": [-0.77, 0.33, 0.49, 0.22, 0.16]
  },
  {
    "key": "letters",
    "title": "The house with the pear tree",
    "district": "civic",
    "venues": ["postOffice", "station"],
    "keepsake": "returned letter",
    "correspondent": "Sol",
    "past": "tried to deliver a letter addressed to the house with the pear tree. The whole street had been planted with pears.",
    "recollection": "The first round on a new route took until dusk. People gave excellent directions to places that had disappeared years before.",
    "promise": "Sol remembers a gate that stuck in hot weather. That is one clue the sorting office hasn't tried.",
    "detail": "On the envelope somebody drew a little ladder against a trunk. Three people have claimed the ladder. Nobody has claimed the handwriting.",
    "errand": "Looking for the old address",
    "calls": [{"venues": ["market", "cottages"], "task": "Asking about a stubborn gate"}, {"venues": ["library", "civic"], "task": "Comparing old street numbers"}],
    "chapters": ["The grocer remembered selling pears from the garden.", "A cellar photograph showed the gate with its bottom hinge missing.", "The letter reached a kitchen where the same ladder still served as a pot rack.", "Sol sent back a map marked with every name the street had worn."],
    "notes": ["No house number.", "Count garden walls.", "Take the east stairs.", "Pear blossom in April.", "Ask about the hinge.", "Keep the envelope dry.", "Knock twice at the blue gate."],
    "tasks": ["Reading the pencilled address", "Following the garden walls", "Checking a cellar photograph", "Walking the recovered route"],
    "stride": 1.18,
    "model": "letter-carrier.glb",
    "workPose": [-0.64, -0.21, 0.46, 0.08, 0.32]
  },
  {
    "key": "minutes",
    "title": "Four minutes fast",
    "district": "works",
    "venues": ["clockmaker", "station"],
    "keepsake": "watch case",
    "correspondent": "Davi",
    "past": "set the kitchen clock four minutes fast to help a late sleeper catch the ferry. The sleeper moved away. The clock kept its little lead.",
    "recollection": "There were two times at breakfast. The clock over the sink told one, and the first ferry horn told the other.",
    "promise": "Davi wants the clock running again, including the four minutes it gave everybody for luck.",
    "detail": "The old repair slip says to set the hands by the station. Underneath, in smaller writing, somebody added an exception for breakfast.",
    "errand": "Checking a slow escapement",
    "calls": [{"venues": ["wharf", "beacon"], "task": "Timing a ferry whistle"}, {"venues": ["bindery", "library"], "task": "Looking up the repair date"}],
    "chapters": ["A speck of flour rolled out of the winding hole.", "The repaired clock lost only a breath between ferry whistles.", "The hands were set four minutes ahead and the repair slip tucked inside.", "Davi reported being early for breakfast for the first time in years."],
    "notes": ["Wind after tea.", "Listen under a cup.", "Oil the pivot once.", "Ask which ferry.", "Keep the old spring.", "Four minutes, exactly.", "Put back the pencil slip."],
    "tasks": ["Listening to the escapement", "Cleaning the winding hole", "Timing the first crossing", "Setting the kitchen hands"],
    "stride": 1.06,
    "model": "clock-restorer.glb",
    "workPose": [-1.06, 0.25, 0.33, 0.28, 0.19]
  },
  {
    "key": "rushes",
    "title": "A seat for the small chair",
    "district": "residential",
    "venues": ["cooperage", "atelier", "cottages"],
    "keepsake": "basket gauge",
    "correspondent": "Anja",
    "past": "sat on the smallest chair at a reunion and went straight through the rush seat. Three cousins tried to claim the chair afterward.",
    "recollection": "In the hall stood a chair too small for the adults and too important to throw out. Generations of children had polished its rungs with their heels.",
    "promise": "Anja has a child just the right size for it. The family wants the crooked star woven back into the middle.",
    "detail": "There are five points in the pattern when everyone remembers it aloud. The bit that survived under the frame has six.",
    "errand": "Measuring a chair seat",
    "calls": [{"venues": ["wharf", "boathouse"], "task": "Soaking a bundle of rushes"}, {"venues": ["market", "tearoom"], "task": "Asking who learned the family weave"}],
    "chapters": ["Wet rushes bent round the first corner without snapping.", "A sixth point appeared when the old pattern was turned over.", "The small chair held a grown cousin for the length of a song.", "Anja sent a drawing of two muddy heels hooked on the bottom rung."],
    "notes": ["Soak until supple.", "Wrap the left rail first.", "Six points after all.", "One bundle for mistakes.", "Keep the chair level.", "Trim underneath.", "Leave the crooked point."],
    "tasks": ["Sorting lengths of rush", "Wrapping the first corner", "Tracing the hidden point", "Testing the finished seat"],
    "stride": 0.93,
    "model": "reed-weaver.glb",
    "workPose": [-0.72, 0.42, 0.51, 0.16, 0.36]
  },
  {
    "key": "stars",
    "title": "The window between the roofs",
    "district": "civic",
    "venues": ["observatory", "library"],
    "keepsake": "star wheel",
    "correspondent": "Neri",
    "past": "lay awake on a narrow bed and learned the sky one small patch at a time between the chimney pots.",
    "recollection": "The bedroom window framed precisely three stars in winter. On paper there were thousands more, but those three came home every year.",
    "promise": "Neri has moved to a room with a narrower window. The promise is a star chart that fits on the sill.",
    "detail": "A strip of black paper slides over the chart. Its ragged edge is the roofline, copied on a cold evening with the paper held against the glass.",
    "errand": "Measuring the gap between roofs",
    "calls": [{"venues": ["towers", "terraces"], "task": "Sketching a chimney silhouette"}, {"venues": ["clockmaker", "belfry"], "task": "Checking the hour of the first star"}],
    "chapters": ["A pinhole pricked in the wheel caught the last of the daylight.", "The paper roof hid one star exactly on time.", "The wheel turned to show a constellation small enough for one window.", "Neri found all three lights and wrote the time beside each one."],
    "notes": ["Look north first.", "Measure from the sill.", "The chimney leans.", "Cut a spare wheel.", "Wait ten minutes.", "Ink hides pinholes.", "Save a clear night."],
    "tasks": ["Tracing the roofline", "Piercing a paper star", "Turning the evening chart", "Packing the sill-sized sky"],
    "stride": 1.17,
    "model": "night-astronomer.glb",
    "workPose": [-1.06, 0.26, -0.12, -0.3, 0.12]
  },
  {
    "key": "crust",
    "title": "The loaf with two heels",
    "district": "exchange",
    "venues": ["bakery", "market"],
    "keepsake": "bread tin",
    "correspondent": "Nessa",
    "past": "spent a childhood fighting over the heel of the loaf. The family solution was to bake on alternate days, which suited nobody.",
    "recollection": "At breakfast the heel was toasted last and eaten first. Half the arguments in the kitchen could be dated by the missing bread knife.",
    "promise": "Nessa still likes the crust best. The new tin should make a supper loaf with a heel for everyone.",
    "detail": "A finger pressed into the dough leaves a valley down the middle. On the test loaf it closed in the oven and made a perfect place to put the butter.",
    "errand": "Trying a divided loaf",
    "calls": [{"venues": ["pottery", "cooperage"], "task": "Measuring a divider for the tin"}, {"venues": ["tearoom", "bathhouse"], "task": "Sharing the morning crusts"}],
    "chapters": ["The first divider stuck fast and went to tea with the bread.", "A folded strip of oiled paper lifted free while the loaf was warm.", "Six crisp ends came out of one tin and nobody had to draw lots.", "Nessa asked for the middle piece, just to hear everybody laugh."],
    "notes": ["Brush both sides.", "Salt before slicing.", "Bake the little one first.", "Save six paper strips.", "Try a shorter fold.", "Cool on its side.", "Custody of the bread knife rotates."],
    "tasks": ["Oiling the bread tin", "Folding paper dividers", "Counting crisp ends", "Handing round warm crusts"],
    "stride": 0.91,
    "model": "bread-baker.glb",
    "workPose": [-0.6, 0.31, 0.58, 0.15, 0.28]
  },
  {
    "key": "rain",
    "title": "Rain on both sides",
    "district": "gardens",
    "venues": ["glasshouse", "orangery"],
    "keepsake": "rain gauge",
    "correspondent": "Ola",
    "past": "missed a picnic because it rained at home. The others spent the afternoon in sunshine three streets away.",
    "recollection": "A wet postcard arrived from the sunny end of town. The postmark was quite dry. Rain had caught it somewhere between the two front doors.",
    "promise": "Ola keeps the other gauge. Each evening the two compare the day's weather in spoonfuls.",
    "detail": "The first weather chart had a single square for each day. A pencil line down the middle made room for both sides of the bridge.",
    "errand": "Reading the rain gauge",
    "calls": [{"venues": ["wharf", "boathouse"], "task": "Checking the water under the bridge"}, {"venues": ["postOffice", "station"], "task": "Sending the other bank a reading"}],
    "chapters": ["A slug camped in the measuring cup and upset a whole week's figures.", "Two gauges stood level and empty before a shower crossed the bridge.", "The chart showed the narrow strip of rain that had missed the picnic.", "Ola sent a dry leaf pressed between two soaking sheets of figures."],
    "notes": ["Empty at dusk.", "Check for slugs.", "North rim level.", "A spoonful is plenty.", "Record dry days too.", "Note the wind.", "Pack the picnic anyway."],
    "tasks": ["Levelling the gauge", "Emptying the measuring cup", "Comparing the two readings", "Coloring the rainfall chart"],
    "stride": 0.93,
    "model": "rain-recorder.glb",
    "workPose": [-0.87, -0.18, 0.27, 0.23, 0.14]
  },
  {
    "key": "strings",
    "title": "The note in the stairwell",
    "district": "works",
    "venues": ["musicHall", "atelier"],
    "keepsake": "tuning fork",
    "correspondent": "Teo",
    "past": "heard a single note on the stairs after the last tenant moved out. It was the brass handrail answering a violin downstairs.",
    "recollection": "Everyone remembered how a fiddle sounded in the old stairwell. Nobody could agree on the tune, but they could all hum the note that hung behind it.",
    "promise": "Teo has the violin and one free evening. A new sound post might bring back the note.",
    "detail": "The offcuts live in a matchbox. Each one is dated in pencil so the next repairer will know which piece once filled the room with music.",
    "errand": "Listening for the answering note",
    "calls": [{"venues": ["arches", "station"], "task": "Testing the landing echo"}, {"venues": ["cooperage", "bindery"], "task": "Choosing tight-grained offcuts"}],
    "chapters": ["The fork woke a low hum in the brass rail.", "A sliver of spruce stood up inside the fiddle on the third attempt.", "One bowed string made the empty stair ring again.", "Teo played a whole tune, then waited on the landing for its last note."],
    "notes": ["Tap on wood.", "Mind the varnish.", "Hum before tuning.", "Save the short offcut.", "Measure with thread.", "Close the matchbox.", "Listen after the bow lifts."],
    "tasks": ["Sounding the tuning fork", "Shaping the spruce sliver", "Testing the open string", "Listening on the landing"],
    "stride": 1.2,
    "model": "violin-maker.glb",
    "workPose": [-1.14, 0.19, 0.41, -0.08, 0.23]
  },
  {
    "key": "tiles",
    "title": "One square of the sea",
    "district": "residential",
    "venues": ["pottery", "bathhouse"],
    "keepsake": "sample tile",
    "correspondent": "Jo",
    "past": "learned to swim by following a blue fish across the tiled floor. Years later a repair left a white square where its tail had been.",
    "recollection": "The old pool had a school of little fish set into its floor. Children with their heads underwater knew the design better than any of the grown-ups.",
    "promise": "Jo can still draw the missing tail with eyes closed. The repair needs one square of exactly the right blue.",
    "detail": "Dry samples are no use. The test tiles travel round in a damp pocket and get dipped in a basin before anyone is allowed to choose.",
    "errand": "Comparing a wet tile",
    "calls": [{"venues": ["boathouse", "wharf"], "task": "Matching the color under water"}, {"venues": ["atelier", "library"], "task": "Tracing the old fish pattern"}],
    "chapters": ["The first blue vanished into gray under a handspan of water.", "A former swimmer drew a fork in the tail that nobody had remembered.", "The little fish swam all the way across the pool floor again.", "Jo slipped under the water and found the tail on the first length."],
    "notes": ["Wet it first.", "Count from the steps.", "Tail points left.", "Number every sample.", "Use the shallow basin.", "Grout gets lighter.", "Leave a dry towel."],
    "tasks": ["Dipping the samples", "Tracing the forked tail", "Fitting the blue square", "Checking the fish underwater"],
    "stride": 0.97,
    "model": "tile-setter.glb",
    "workPose": [-0.77, 0.35, 0.51, 0.29, 0.19]
  },
  {
    "key": "floats",
    "title": "The first length",
    "district": "civic",
    "venues": ["bathhouse", "boathouse"],
    "keepsake": "cork float",
    "correspondent": "Ari",
    "past": "taught a little brother to float by asking him to count the beams in the ceiling. He made it to nine before realizing the hands had let go.",
    "recollection": "At the shallow end there was a line of faded corks. Children could tell how far they had swum by which cork was opposite their nose.",
    "promise": "Ari has signed up for lessons after a lifetime of minding the towels. The old corks are coming out for one more summer.",
    "detail": "The last cork has a red stripe. It once meant deep water. Today the teacher ties it wherever the swimmer wants to try reaching next.",
    "errand": "Marking a first swimming length",
    "calls": [{"venues": ["sailLoft", "wharf"], "task": "Collecting a length of soft line"}, {"venues": ["market", "tearoom"], "task": "Finding the swimmer after practice"}],
    "chapters": ["The first cork floated sideways until its knot was shifted.", "Ari reached the third cork and came up laughing.", "The red stripe made it to the other end of the pool.", "Ari brought someone new and tied the first cork within arm's reach."],
    "notes": ["Count the beams.", "Loosen wet knots.", "Three corks today.", "Warm towel first.", "Move the red one.", "Let go slowly.", "Remember who held you."],
    "tasks": ["Checking the cork line", "Tying a softer knot", "Moving the red marker", "Counting the first length"],
    "stride": 1.1,
    "model": "swim-steward.glb",
    "workPose": [-0.56, -0.34, 0.39, -0.14, 0.33]
  }
];
