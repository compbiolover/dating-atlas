# Dating Atlas™

Dating Atlas estimates how many people in a U.S. metro could realistically be your match, and compares that number across all 387 metro areas. It is a single web page with its data built in.

Live page: https://claude.ai/artifact/Cp6FKad8tKBi8rRoqjimqJ

![Dating Atlas showing 215 possibilities in Memphis, with the funnel from 1.3 million people down to 49 on the apps](docs/atlas-screenshot.png)

## What it does

You pick a metro and say who you are and who you're looking for. The page then shows:

- your number of real possibilities, with an 80% range and a note on which inputs make it uncertain
- a funnel of how the metro's population narrows: people of the genders you date, in your age range, single, looking, with a degree, open to dating you, sharing your politics, faith and diet, compatible on kids, and mutually attracted
- a map of every metro, with circles sized by how many of your possibilities are on dating apps right now
- a ranked list you can sort by number of possibilities, competition, gender balance or rent
- how many people are looking for the same partners as you, and what a 1-bedroom costs as a share of local pay

You can filter by politics (progressive, conservative or any), faith (secular-leaning, Christian, Catholic, Protestant, Latter-day Saint, Jewish, Muslim, Hindu, Buddhist, Pagan or Wiccan, or any) and diet (vegetarian, vegan, pescatarian, kosher, halal or any). Your age, height, education, work and kids plans change how interested people are likely to be. Two quick picks set the default profile (progressive and secular) or the opposite one (conservative and Christian).

The page saves your settings in your browser and in its address, so a copied link reopens the same result.

## How the estimate works

Each funnel step multiplies the one before it. The steps that differ by metro use local data:

| Step | Source |
|---|---|
| Population | Census Bureau 2025 estimates for the 387 metropolitan statistical areas |
| Single people by age, and the degree share | American Community Survey 2019 to 2023, tables B12002 and B15001 |
| Politics | 2024 presidential vote by county, summed to metros |
| Faith | PRRI Census of American Religion county estimates, and the 2020 U.S. Religion Census |
| Single parents | ACS table B11012 |
| Rent and pay | ACS tables B25031, B25113 and B20004 |

The behavioral steps use national rates: who is looking to date (Pew), who is open to dating each gender (Gallup), attraction rates (speed-dating studies), dating-app use (Pew) and diets (Gallup, NHANES, Pew and ISPU). `docs/clicks-research.md` covers the evidence behind the attraction and app defaults, and the page's "How the estimates work" section lists every source with links.

The range under the main number comes from a Monte Carlo simulation. The page reruns the funnel 2,000 times, and each run varies every input by how uncertain it is. Local counts vary by their Census margins of error, survey rates by their sample sizes, and modeling assumptions over stated ranges. The page shows the middle 80% of the results. That range covers uncertainty in the inputs, not in how the funnel is built.

## Repository layout

```
atlas/index.html    the whole page, with all metro data embedded
data/               the extracted metro data the page is built from
docs/               research notes and the screenshot above
scripts/            scripts that rebuild the embedded data
```

| Script | What it rebuilds |
|---|---|
| `scripts/pull_acs.R` | Pulls ACS tables B12002, B15001 and B11012 for every metro with tidycensus, into `data/metro_acs_2023.csv` and `data/acs_variables_2023.csv`. Needs a Census API key. |
| `scripts/acs_to_json.py` | Turns that ACS extract into the page's `ACS` object: single people by age band, degree shares and single parents. |
| `scripts/acs_moe_to_json.py` | Embeds ACS standard errors (`ACSE`) for the uncertainty range, from the Census table-based summary files. No API key needed. |
| `scripts/religion_to_json.py` | Embeds congregation membership and the unaffiliated share (`REL`), which feed the secular-leaning share. Writes `data/metro_religion.csv`. |
| `scripts/faith_to_json.py` | Embeds PRRI's share for each faith group (`FAITH`), used by the faith filter. Writes `data/metro_faith.csv`. |
| `scripts/housing_to_json.py` | Embeds rent and pay (`HOUSE`) from the Census summary files. Writes `data/metro_housing.csv`. |
| `scripts/build_map.mjs` | Rebuilds the map's metro positions and state outlines (`MAPXY`, `USMAP`) from the 2023 Census Gazetteer and us-atlas. |

## Rebuilding the data

The 2019 to 2023 data is already in `data/` and embedded in the page. To rebuild it:

```sh
Rscript scripts/pull_acs.R    # needs a Census API key
python3 scripts/acs_to_json.py data/metro_acs_2023.csv data/acs_variables_2023.csv
PYTHONPATH=scripts python3 scripts/acs_moe_to_json.py acsdt5y2023-b12002.dat acsdt5y2023-b15001.dat
python3 scripts/religion_to_json.py 2020_USRC_Summaries.xlsx prri_county.csv list1_2023.xlsx
PYTHONPATH=scripts python3 scripts/faith_to_json.py prri_county.csv list1_2023.xlsx
python3 scripts/housing_to_json.py acsdt5y2023-b25031.dat acsdt5y2023-b25113.dat acsdt5y2023-b20004.dat
npm i d3-geo topojson-client us-atlas && node scripts/build_map.mjs > map.json
```

Each script's header says where to download its inputs. The national summary files are large, but you only need the header and the lines that start with `310M`, which are the metros.

## Limitations

- Faith shares describe all adults, not young singles, so groups that skew young or old will be off.
- Diet rates and most behavioral rates are national. Kosher and halal follow the local Jewish and Muslim shares.
- No source estimates Pagans or Wiccans by metro, so that option scales a national figure (about 0.3% of adults) by each metro's share of other religions.
- The funnel treats its steps as independent, apart from a boost for matching politics and faith.
- Small metros have wide ACS margins of error, and their ranges are wider to match.

## Trademark

Dating Atlas™ is a trademark of the repository owner ([compbiolover](https://github.com/compbiolover)). Please don't use the name for other dating tools or services without permission.
