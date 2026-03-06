// src/components/hooks/useCityCoords.jsx
// Lightweight US city/state coordinate lookup for travel distance estimation.

// State center coordinates (all 50 states)
const STATE_CENTERS = {
  AL:[32.8,-86.8],AK:[64.2,-152.5],AZ:[34.0,-111.1],AR:[35.0,-92.4],CA:[36.8,-119.4],
  CO:[39.0,-105.5],CT:[41.6,-72.7],DE:[39.0,-75.5],FL:[27.8,-81.8],GA:[32.2,-83.4],
  HI:[19.9,-155.6],ID:[44.1,-114.7],IL:[40.6,-89.4],IN:[40.3,-86.1],IA:[42.0,-93.2],
  KS:[38.5,-98.8],KY:[37.8,-84.3],LA:[31.2,-92.1],ME:[45.4,-69.4],MD:[39.0,-76.6],
  MA:[42.4,-71.4],MI:[44.3,-84.5],MN:[46.4,-94.7],MS:[32.4,-89.7],MO:[38.6,-92.6],
  MT:[46.9,-110.4],NE:[41.1,-98.3],NV:[38.8,-116.4],NH:[43.2,-71.6],NJ:[40.1,-74.5],
  NM:[34.5,-106.0],NY:[43.0,-75.0],NC:[35.8,-79.0],ND:[47.5,-100.4],OH:[40.4,-82.8],
  OK:[35.6,-96.9],OR:[43.8,-120.6],PA:[41.2,-77.2],RI:[41.6,-71.5],SC:[33.8,-81.2],
  SD:[43.9,-99.4],TN:[35.5,-86.0],TX:[31.0,-100.0],UT:[39.3,-111.1],VT:[44.0,-72.7],
  VA:[37.4,-78.7],WA:[47.8,-120.7],WV:[38.6,-80.6],WI:[43.8,-89.5],WY:[43.1,-107.6],
  DC:[38.9,-77.0]
};

// Top US cities + college towns (city:STATE → [lat, lng])
const CITY_COORDS = {
  "new york:NY":[40.71,-74.01],"los angeles:CA":[34.05,-118.24],"chicago:IL":[41.88,-87.63],
  "houston:TX":[29.76,-95.37],"phoenix:AZ":[33.45,-112.07],"philadelphia:PA":[39.95,-75.17],
  "san antonio:TX":[29.42,-98.49],"san diego:CA":[32.72,-117.16],"dallas:TX":[32.78,-96.80],
  "san jose:CA":[37.34,-121.89],"austin:TX":[30.27,-97.74],"jacksonville:FL":[30.33,-81.66],
  "fort worth:TX":[32.76,-97.33],"columbus:OH":[39.96,-83.00],"charlotte:NC":[35.23,-80.84],
  "san francisco:CA":[37.77,-122.42],"indianapolis:IN":[39.77,-86.16],"seattle:WA":[47.61,-122.33],
  "denver:CO":[39.74,-104.99],"washington:DC":[38.91,-77.04],"nashville:TN":[36.16,-86.78],
  "oklahoma city:OK":[35.47,-97.52],"el paso:TX":[31.76,-106.49],"boston:MA":[42.36,-71.06],
  "portland:OR":[45.51,-122.68],"las vegas:NV":[36.17,-115.14],"memphis:TN":[35.15,-90.05],
  "louisville:KY":[38.25,-85.76],"baltimore:MD":[39.29,-76.61],"milwaukee:WI":[43.04,-87.91],
  "albuquerque:NM":[35.08,-106.65],"tucson:AZ":[32.22,-110.97],"fresno:CA":[36.74,-119.77],
  "sacramento:CA":[38.58,-121.49],"mesa:AZ":[33.42,-111.83],"kansas city:MO":[39.10,-94.58],
  "atlanta:GA":[33.75,-84.39],"omaha:NE":[41.26,-95.94],"colorado springs:CO":[38.83,-104.82],
  "raleigh:NC":[35.78,-78.64],"long beach:CA":[33.77,-118.19],"virginia beach:VA":[36.85,-75.98],
  "miami:FL":[25.76,-80.19],"oakland:CA":[37.80,-122.27],"minneapolis:MN":[44.98,-93.27],
  "tulsa:OK":[36.15,-95.99],"tampa:FL":[27.95,-82.46],"arlington:TX":[32.74,-97.11],
  "new orleans:LA":[29.95,-90.07],"wichita:KS":[37.69,-97.34],"cleveland:OH":[41.50,-81.69],
  "bakersfield:CA":[35.37,-119.02],"aurora:CO":[39.73,-104.83],"anaheim:CA":[33.84,-117.91],
  "honolulu:HI":[21.31,-157.86],"santa ana:CA":[33.75,-117.87],"riverside:CA":[33.95,-117.40],
  "corpus christi:TX":[27.80,-97.40],"lexington:KY":[38.04,-84.50],"pittsburgh:PA":[40.44,-80.00],
  "anchorage:AK":[61.22,-149.90],"stockton:CA":[37.96,-121.29],"cincinnati:OH":[39.10,-84.51],
  "saint paul:MN":[44.94,-93.09],"toledo:OH":[41.65,-83.54],"newark:NJ":[40.74,-74.17],
  "greensboro:NC":[36.07,-79.79],"plano:TX":[33.02,-96.70],"henderson:NV":[36.04,-115.04],
  "lincoln:NE":[40.81,-96.70],"buffalo:NY":[42.89,-78.88],"fort wayne:IN":[41.08,-85.14],
  "jersey city:NJ":[40.73,-74.08],"chula vista:CA":[32.64,-117.08],"norfolk:VA":[36.85,-76.29],
  "orlando:FL":[28.54,-81.38],"chandler:AZ":[33.31,-111.84],"st. petersburg:FL":[27.77,-82.64],
  "laredo:TX":[27.51,-99.51],"madison:WI":[43.07,-89.40],"lubbock:TX":[33.58,-101.85],
  "durham:NC":[35.99,-78.90],"winston-salem:NC":[36.10,-80.24],"garland:TX":[32.91,-96.64],
  "glendale:AZ":[33.54,-112.19],"reno:NV":[39.53,-119.81],"baton rouge:LA":[30.45,-91.19],
  "irvine:CA":[33.68,-117.83],"chesapeake:VA":[36.77,-76.29],"irving:TX":[32.81,-96.95],
  "scottsdale:AZ":[33.49,-111.93],"north las vegas:NV":[36.20,-115.12],
  "fremont:CA":[37.55,-121.99],"gilbert:AZ":[33.35,-111.79],"san bernardino:CA":[34.11,-117.29],
  "boise:ID":[43.62,-116.21],"birmingham:AL":[33.52,-86.80],"rochester:NY":[43.16,-77.62],
  "richmond:VA":[37.54,-77.44],"spokane:WA":[47.66,-117.43],"des moines:IA":[41.59,-93.62],
  "montgomery:AL":[32.38,-86.30],"modesto:CA":[37.64,-120.997],"fayetteville:NC":[35.05,-78.88],
  "tacoma:WA":[47.25,-122.44],"shreveport:LA":[32.53,-93.75],"fontana:CA":[34.09,-117.44],
  "moreno valley:CA":[33.94,-117.23],"akron:OH":[41.08,-81.52],"yonkers:NY":[40.93,-73.90],
  "aurora:IL":[41.76,-88.32],"huntsville:AL":[34.73,-86.59],"little rock:AR":[34.75,-92.29],
  "grand rapids:MI":[42.96,-85.66],"amarillo:TX":[35.22,-101.83],"glendale:CA":[34.14,-118.26],
  "mobile:AL":[30.69,-88.04],"knoxville:TN":[35.96,-83.92],"salt lake city:UT":[40.76,-111.89],
  "tallahassee:FL":[30.44,-84.28],"huntington beach:CA":[33.66,-117.999],
  "worcester:MA":[42.26,-71.80],"tempe:AZ":[33.43,-111.94],"providence:RI":[41.82,-71.41],
  "cape coral:FL":[26.56,-81.95],"sioux falls:SD":[43.55,-96.73],"eugene:OR":[44.05,-123.09],
  "springfield:MO":[37.22,-93.29],"peoria:AZ":[33.58,-112.24],"columbia:SC":[34.00,-81.03],
  "chattanooga:TN":[35.05,-85.31],"jackson:MS":[32.30,-90.18],"fort collins:CO":[40.59,-105.08],
  "columbia:MO":[38.95,-92.33],"savannah:GA":[32.08,-81.10],"gainesville:FL":[29.65,-82.32],
  "bellevue:WA":[47.61,-122.20],"macon:GA":[32.84,-83.63],"waco:TX":[31.55,-97.15],
  "athens:GA":[33.96,-83.38],"topeka:KS":[39.05,-95.68],"provo:UT":[40.23,-111.66],
  "norman:OK":[35.22,-97.44],"college station:TX":[30.63,-96.33],"fargo:ND":[46.88,-96.79],
  "tuscaloosa:AL":[33.21,-87.57],"auburn:AL":[32.61,-85.48],"clemson:SC":[34.68,-82.84],
  "ann arbor:MI":[42.28,-83.74],"state college:PA":[40.79,-77.86],"ames:IA":[42.03,-93.62],
  "gainesville:GA":[34.30,-83.82],"lawrence:KS":[38.97,-95.24],"stillwater:OK":[36.12,-97.06],
  "starkville:MS":[33.45,-88.82],"manhattan:KS":[39.18,-96.57],"corvallis:OR":[44.56,-123.26],
  "pullman:WA":[46.73,-117.17],"morgantown:WV":[39.63,-79.96],"blacksburg:VA":[37.23,-80.41],
  "charlottesville:VA":[38.03,-78.48],"champaign:IL":[40.12,-88.24],"bloomington:IN":[39.17,-86.53],
  "iowa city:IA":[41.66,-91.53],"boulder:CO":[40.01,-105.27],"missoula:MT":[46.87,-114.00],
  "laramie:WY":[41.31,-105.59],"hattiesburg:MS":[31.33,-89.29],
  "murfreesboro:TN":[35.85,-86.39],"bowling green:KY":[36.99,-86.44],
  "boone:NC":[36.22,-81.67],"greenville:SC":[34.85,-82.39],"greenville:NC":[35.61,-77.37],
  "pensacola:FL":[30.44,-87.22],"fort myers:FL":[26.64,-81.87],"lakeland:FL":[28.04,-81.95],
  "daytona beach:FL":[29.21,-81.02],"st. louis:MO":[38.63,-90.20],"detroit:MI":[42.33,-83.05],
  "newark:DE":[39.68,-75.75],"west lafayette:IN":[40.43,-86.91],"logan:UT":[41.74,-111.83],
  "pocatello:ID":[42.86,-112.45],"flagstaff:AZ":[35.20,-111.65],"troy:AL":[31.81,-85.97],
  "ruston:LA":[32.52,-92.64],"lafayette:LA":[30.22,-92.02],"beaumont:TX":[30.09,-94.10],
  "tyler:TX":[32.35,-95.30],"abilene:TX":[32.45,-99.73],"san marcos:TX":[29.88,-97.94],
  "denton:TX":[33.21,-97.13],"round rock:TX":[30.51,-97.68],"mcallen:TX":[26.20,-98.23],
  "midland:TX":[31.997,-102.08],"odessa:TX":[31.85,-102.35],"bryan:TX":[30.67,-96.37],
  // Texas suburbs & college towns
  "the colony:TX":[33.10,-96.89],"frisco:TX":[33.15,-96.82],"mckinney:TX":[33.20,-96.64],
  "allen:TX":[33.10,-96.67],"prosper:TX":[33.24,-96.80],"celina:TX":[33.33,-96.78],
  "lewisville:TX":[33.05,-97.06],"flower mound:TX":[33.01,-97.10],"southlake:TX":[32.94,-97.13],
  "keller:TX":[32.93,-97.23],"mansfield:TX":[32.56,-97.14],"cedar hill:TX":[32.59,-96.96],
  "desoto:TX":[32.59,-96.86],"huntsville:TX":[30.72,-95.55],"nacogdoches:TX":[31.60,-94.66],
  "commerce:TX":[33.25,-95.90],"stephenville:TX":[32.22,-98.20],"canyon:TX":[34.98,-101.92],
  "kingsville:TX":[27.52,-97.86],"alpine:TX":[30.36,-103.66],"edinburg:TX":[26.30,-98.16],
  "prairie view:TX":[30.09,-95.99],"san angelo:TX":[31.46,-100.44],
  // College towns across states
  "oxford:MS":[34.37,-89.52],"natchitoches:LA":[31.76,-93.09],"thibodaux:LA":[29.80,-90.82],
  "jonesboro:AR":[35.84,-90.70],"russellville:AR":[35.28,-93.13],"magnolia:AR":[33.27,-93.24],
  "cookeville:TN":[36.16,-85.50],"clarksville:TN":[36.53,-87.36],"johnson city:TN":[36.31,-82.35],
  "florence:AL":[34.80,-87.68],"jacksonville:AL":[33.81,-85.76],"livingston:AL":[32.59,-88.19],
  "valdosta:GA":[30.83,-83.28],"statesboro:GA":[32.45,-81.78],"carrollton:GA":[33.58,-85.08],
  "milledgeville:GA":[33.08,-83.23],"kennesaw:GA":[34.02,-84.62],
  "boca raton:FL":[26.37,-80.13],"miami gardens:FL":[25.94,-80.24],
  "cullowhee:NC":[35.31,-83.18],"pembroke:NC":[34.68,-79.20],"elon:NC":[36.10,-79.51],
  "harrisonburg:VA":[38.45,-78.87],"radford:VA":[37.13,-80.58],"farmville:VA":[37.30,-78.40],
  "lynchburg:VA":[37.41,-79.14],"williamsburg:VA":[37.27,-76.71],
  "murray:KY":[36.61,-88.32],"richmond:KY":[37.75,-84.29],"morehead:KY":[38.18,-83.43],
  "terre haute:IN":[39.47,-87.41],"muncie:IN":[40.19,-85.39],
  "kalamazoo:MI":[42.29,-85.59],"ypsilanti:MI":[42.24,-83.61],"mount pleasant:MI":[43.60,-84.77],
  "dekalb:IL":[41.93,-88.75],"macomb:IL":[40.46,-90.67],"carbondale:IL":[37.73,-89.22],
  "vermillion:SD":[42.78,-96.93],"brookings:SD":[44.31,-96.80],
  "warrensburg:MO":[38.76,-93.74],"cape girardeau:MO":[37.31,-89.52],"kirksville:MO":[40.19,-92.58],
  "pittsburg:KS":[37.41,-94.70],"emporia:KS":[38.40,-96.18],"hays:KS":[38.88,-99.33],
  "weatherford:OK":[35.53,-98.71],"durant:OK":[33.99,-96.39],"tahlequah:OK":[35.91,-94.97],
  "edmond:OK":[35.65,-97.48],"ada:OK":[34.77,-96.68],
  "conway:AR":[35.09,-92.44],"monticello:AR":[33.63,-91.79],"searcy:AR":[35.25,-91.74],
  "hammond:LA":[30.50,-90.46],"monroe:LA":[32.51,-92.12],"lake charles:LA":[30.23,-93.22],
  "san bernardino:CA":[34.11,-117.29],"pomona:CA":[34.06,-117.75],
  "cheney:WA":[47.49,-117.58],"ellensburg:WA":[46.99,-120.55],
  "monmouth:OR":[44.85,-123.23],"ashland:OR":[42.19,-122.71],
  "cedar falls:IA":[42.53,-92.45],"storm lake:IA":[42.64,-95.21],
  "wayne:NE":[42.23,-97.02],"kearney:NE":[40.70,-99.08],
  "grand forks:ND":[47.93,-97.03],"minot:ND":[48.23,-101.30],
  "duluth:MN":[46.79,-92.10],"mankato:MN":[44.17,-94.00],"moorhead:MN":[46.87,-96.77],
  "whitewater:WI":[42.83,-88.73],"la crosse:WI":[43.81,-91.24],"eau claire:WI":[44.81,-91.50],
  "marquette:MI":[46.54,-87.40],"sault ste. marie:MI":[46.50,-84.35],"big rapids:MI":[43.70,-85.48],
  "charleston:WV":[38.35,-81.63],"huntington:WV":[38.42,-82.44],
  "burlington:VT":[44.48,-73.21],"hanover:NH":[43.70,-72.29],
  "orono:ME":[44.88,-68.67],"amherst:MA":[42.38,-72.52],
  "storrs:CT":[41.81,-72.25],"new haven:CT":[41.31,-72.92],
  "princeton:NJ":[40.35,-74.66],"new brunswick:NJ":[40.49,-74.45],
  "bethlehem:PA":[40.63,-75.37],"university park:PA":[40.81,-77.86],
  "ithaca:NY":[42.44,-76.50],"syracuse:NY":[43.05,-76.15],
  "canton:NY":[44.60,-75.17],"potsdam:NY":[44.67,-74.98]
};

export function getCityCoords(city, state) {
  if (!city && !state) return null;
  const st = String(state || "").trim().toUpperCase();

  if (city) {
    const c = String(city).trim().toLowerCase();
    const key = `${c}:${st}`;
    if (CITY_COORDS[key]) return { lat: CITY_COORDS[key][0], lng: CITY_COORDS[key][1] };
  }

  // Do NOT fall back to state center — it causes same-state camps
  // to resolve to the same point, making distance ≈ 0.
  // Return null so the caller knows lookup failed.
  return null;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}