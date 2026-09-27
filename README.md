# dating-atlas

Source for the **Metro Dating Pool Atlas** page (published at https://claude.ai/artifact/Cp6FKad8tKBi8rRoqjimqJ).

- `atlas/index.html`: the whole page, with its metro data embedded. Pick who you are (man, woman, nonbinary) and who you're looking for (any mix of women, men and nonbinary people). The page shows your estimated pool, a competition ratio, and a list you can sort by pool size, competition ratio or sex ratio.
- `scripts/pull_acs.R`: pulls ACS 2019–23 tables B12002 (marital status by sex and age) and B15001 (education by sex and age) for every metro with tidycensus. It writes `data/metro_acs_2023.csv` and `data/acs_variables_2023.csv`.
- `scripts/acs_to_json.py`: converts those two files into the `ACS` object the page reads and embeds it in `atlas/index.html`.
- `scripts/religion_to_json.py`: reads `2020_USRC_Summaries.xlsx` from the [2020 U.S. Religion Census](https://www.usreligioncensus.org/node/1639) and embeds each metro's congregational adherence rate as the `REL` object, which feeds the secular-leaning share. It writes `data/metro_religion_2020.csv`.

## Loading the census data

```sh
Rscript scripts/pull_acs.R           # needs a Census API key
python3 scripts/acs_to_json.py data/metro_acs_2023.csv data/acs_variables_2023.csv
python3 scripts/religion_to_json.py path/to/2020_USRC_Summaries.xlsx
```

The 2019–23 extract is in `data/` and embedded in the page, and all 387 metros match. Each metro uses its real counts of never-married, divorced and widowed people by age band, less about 15% who live with a partner, plus the real share of women and men 25–34 with a bachelor's or higher.
