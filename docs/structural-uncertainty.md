# How the funnel is built: a structural check

The range under the main number covers uncertainty in the inputs, not in how the funnel is built. This note measures the second kind. It checks each structural assumption against survey microdata (step 1), then replaces the biggest one with estimates from data (step 2). Step 2 is now applied to the page (`scripts/structure/step2-values-joint.patch`), and so are next steps 2 and 3 (the degree share by age band and cohabiting rates by age; see "Applied after step 2" below). Every "before" figure below is the page as it was before that change; the scripts read it from git (commit 73d4238), so the analysis reproduces.

## Summary

- **The structure mostly shifts the level, not the ranking.** Across six searches and all 387 metros, the data-based alternatives keep the metro ranking almost intact (rank correlation 0.986 to 1.000, and 23 to 25 of the top 25 stay in the top 25). What they change is the size of the number, and mostly in one direction: down.
- **The biggest problem is the ×1.5 boost for matching politics and faith, and in part it's a logic error.** In 152 of 387 metros (69% of the population), the default search counts more women as both progressive and secular-leaning than there are secular-leaning women at all. In San Francisco the overcount is 35%. For conservative and Christian it happens in about 296 metros. Among single 25-to-35-year-olds in the 2024 Cooperative Election Study (CES), the two go together about 1.1 to 1.25 times more often than chance, not 1.5.
- **Step 2 replaces the boost with survey data.** The overlap now comes from the measured odds ratio, which can never exceed either share, and a degree now shifts politics and faith as it does in the survey. The default search in Memphis goes from 216 to 175 (95% interval from the survey data: ×0.70 to ×0.91). The population-weighted change across metros is ×0.77 for the default search and about ×0.70 for conservative and Christian. Rankings barely move. The gap between Democratic- and Republican-leaning metros narrows, because the old boost inflated the most progressive, most secular metros the most.
- **Several other assumptions are wrong by 8 to 37%, in measurable ways.** The degree step uses the degree share of everyone aged 25 to 34. Singles hold degrees about 10% less often, and the page uses the 25-to-34 share whatever age range you pick (singles 40 to 50 hold degrees at 0.78 times that rate). The flat 15% cohabiting cut is too small for young singles (26% of women and 22% of men aged 25 to 35 live with a partner). The faith shares describe all adults, but young singles are only 0.68 times as likely to be Christian.
- **The secular-leaning level is not clearly off, but it should fall with age.** CES finds 6 to 7 points more young singles with no religion than the page assumes, but CES also finds about 7 points more unaffiliated adults overall than the GSS, PRRI or Pew. That's a survey house effect, not an error on the page. Across sources, the share of single women 25 to 35 with no religion runs from about 32% (on PRRI's scale) through 37.5% (GSS) to 48% (CES); the page's 40% sits in the middle. The real problem is age: the page uses the same base at every age, while the no-religion share among singles falls from 37.5% at 25 to 35 to about 22% at 46 to 55 (GSS, women). For a search for women 40 to 50 that alone is ×0.76.
- **Some assumptions hold up.** Mutual attraction is close to his rate times her rate (lift 1.03). Openness to dating your gender barely varies with politics (within 2.5%). The progressive model fits young single women well. For men it's too steep: it overstates how progressive men are in the most Democratic metros.
- **Recommendation: fix rather than widen.** The structural errors found here are systematic biases with data to correct them, not random noise. Folding them into the range as judgment would widen it around a center that's known to be off. Step 2, the degree share's age band and the cohabiting rate are applied. Next, fix the faith shares and the secular share's age gradient, and carry each correction's own statistical uncertainty into the range. Step 2 shows how. The one finding that does belong in the range is the secular-leaning level, where sources disagree with no known direction of error.

## Method

**Harness.** `scripts/structure/harness.mjs` loads the page in headless Chromium and runs its own `pool()` for every metro. One override layer switches each structural assumption to an alternative, controlled by a plain-data scenario. With no scenario it reproduces the page exactly: the default search in Memphis gives 215.9, shown as 216, with an 80% range of 111 to 348. An assertion checks that the override path matches the original on every metro.

**Searches.** Each alternative was run for the default search (a man of 30 looking for women 25 to 35, progressive and secular-leaning, degree filter on). It was also run for the mirror image (a woman looking for men), the conservative and Christian quick pick for both, the default without the degree filter, the default with no politics or faith filter, and an older search (a man of 45 looking for women 40 to 50).

**Data.**

| Source | What it measures | Size |
|---|---|---|
| 2024 Cooperative Election Study, common content ([doi:10.7910/DVN/X11EP6](https://doi.org/10.7910/DVN/X11EP6)) | Joint distributions of degree, party ID, ideology, religion, sexuality, marital status, county | 60,000 adults; 4,485 single (never married, divorced or widowed) women and men aged 25 to 35 |
| 2023 ACS 1-year PUMS (Census Bureau) | Degree share of singles vs everyone; who lives with a partner | 1.9 million people aged 20 to 64; 194,500 singles aged 25 to 35 not living with a partner |
| Columbia speed-dating experiment (Fisman, Iyengar, Kamenica and Simonson 2006) | Whether one person's yes predicts the other's | 551 people, 8,368 dates |
| General Social Survey 2022 and 2024 (NORC) | Religion of young singles in a probability sample, by age and interview mode | 6,456 adults; 985 single women and men aged 25 to 35 |
| 2024 county presidential results (tonmcg) and the 2023 CBSA delineation | Places CES respondents in counties and metros | |

**Definitions in CES.** "Progressive" counts Democrats and leaners as 1, Republicans and leaners as 0, and pure independents as ½, because the page treats progressive and conservative as complements. The results hold if ideology (liberal vs conservative) is used instead. "Secular-leaning" means no religion (atheist, agnostic or nothing in particular); a broader version adds anyone who says religion is not too or not at all important. "Christian" means Protestant, Catholic, Latter-day Saint or Orthodox. All estimates use the survey weights, with 500 bootstrap resamples for intervals; PUMS standard errors use its 80 replicate weights.

**Is CES geographically faithful?** Among all adult voters, CES reproduces the actual metro vote: regressing Harris vote on the metro's Harris share gives a logit slope of 1.03 (SE 0.05), where 1 is perfect. It reproduces PRRI's religious geography less well (slope 0.67, SE 0.08). CES may be smoothing religion across places, or PRRI's county model may exaggerate the differences, so the secular slope test below is inconclusive.

## What the data say about each assumption

Single women and men aged 25 to 35, CES unless noted. The brackets are 95% intervals.

| Assumption on the page | What the data show |
|---|---|
| Politics and faith overlap: matching pairs ×1.5 | Lift 1.10 [1.05, 1.15] for women and 1.17 [1.12, 1.23] for men (progressive with no religion); 1.20 to 1.25 among degree holders. Conservative with Christian: 1.23 to 1.29, rising to 1.56 to 1.64 among degree holders. As odds ratios: 1.8 (women) and 2.3 (men), and 4.8 and 4.1 among degree holders. A fixed ×1.5 also breaks the bound that both together can't exceed either one: in 152 metros with women's shares and 52 with men's for progressive with secular, and in about 296 for conservative with Christian. |
| Degree and politics are independent | Degree holders are more progressive: lift 1.10 [1.05, 1.16] for women and 1.16 [1.08, 1.24] for men, and 0.80 for conservative. They're also more often Christian (lift 1.12 to 1.18) and somewhat less often unaffiliated (0.96 for women, 0.87 for men). |
| Degree share of singles = degree share of everyone 25 to 34 (B15001) | PUMS: singles not living with a partner hold degrees at 0.92 (women) and 0.90 (men) times that share at 25 to 35, falling to 0.76 to 0.78 at 35 to 44, 0.69 to 0.77 at 45 to 54 and 0.63 at 55 to 64. Across states the 25-to-35 ratio runs from 0.81 to 0.95 (10th to 90th percentile), so one national factor is reasonable. |
| 15% of singles cohabit, at every age | PUMS: 26% of single women and 22% of single men aged 25 to 35, 23% to 24% at 35 to 44, 17% to 21% at 45 to 54 and 11% to 16% at 55 to 64. This is a lower bound, since couples living in someone else's household are missed. |
| Faith shares of all adults apply to young singles | Young singles relative to all adults: Christian 0.68, Protestant 0.60, Catholic 0.82, Latter-day Saint 0.63, Jewish 1.05, Muslim 2.2, Hindu 2.0, no religion 1.46. |
| Openness to your gender doesn't depend on politics | Among progressives, the share of women open to dating men is 0.995 times the share among all women; for men open to women it's 0.977. Negligible. |
| Progressive = Harris share + 20 points (men −10) | Women: fits well. The fitted curve and the page agree within about 4 points at the 10th, 50th and 90th percentile metro (logit slope 1.25, SE 0.32, at metro level; 1.05, SE 0.17, at county level). Men: too steep. In the 90th-percentile metro the page says 69% progressive and CES about 60% (slope 0.56, SE 0.27; county level 0.58, SE 0.19). |
| Secular-leaning = 40% + local adjustments (men +4), at every age | The level depends on the survey (see "The secular-leaning level" below): single women 25 to 35 with no religion are about 32% on PRRI's scale, 37.5% in the GSS and 48% in CES, against the page's 40%; men 35% to 39%, 44.8% and 51%, against 44%. It falls with age, which the page ignores: among single women it's 37.5% at 25 to 35, 34.6% at 36 to 45 and 22% at 46 to 55 (GSS; CES shows the same pattern, less steeply). The slope test across metros is inconclusive (see above). |
| Mutual attraction = his yes rate × her yes rate | Speed dating, within each person: lift 1.03 [1.00, 1.05], correlation 0.02. Close to independent. |

## Step 1: how much each alternative moves the number

Each row changes one assumption, at the data's point estimate. "Memphis" is the new number over the old one in Memphis. "Pop-weighted" is the same ratio for the country, weighting each metro by population. The metro range is the 10th to 90th percentile of the ratio across metros. Rank ρ is the Spearman correlation between the old and new metro rankings.

**Default search** (man, women 25 to 35, progressive and secular-leaning, degree filter). Memphis 216; the page's own 80% range runs from ×0.51 to ×1.61.

| Alternative | Memphis | Pop-weighted | Metros (p10 to p90) | Rank ρ | Mean rank change |
|---|---|---|---|---|---|
| Politics × faith from CES odds ratios (no religion) | 0.83 | 0.78 | 0.76 to 1.02 | 0.998 | 5.5 |
| Same, broad secular | 0.84 | 0.79 | 0.77 to 1.05 | 0.998 | 5.9 |
| Politics × faith as a fixed lift from CES | 0.80 | 0.80 | 0.80 | 1.000 | 0.4 |
| Politics × faith independent (no boost) | 0.67 | 0.67 | 0.67 | 1.000 | 0 |
| Degree × politics and faith (CES) | 1.02 | 1.02 | 1.02 to 1.12 | 1.000 | 1.7 |
| Progressive model fitted to CES (level and slope) | 1.03 | 1.02 | 0.98 to 1.04 | 1.000 | 1.8 |
| Progressive model fitted to CES (slope only) | 1.01 | 1.00 | 0.94 to 1.02 | 1.000 | 1.9 |
| Openness × politics (CES) | 1.00 | 1.00 | 1.00 | 1.000 | 0 |
| Degree share of singles (PUMS) | 0.92 | 0.92 | 0.92 | 1.000 | 0 |
| Cohabiting share by sex and age (PUMS) | 0.87 | 0.87 | 0.87 | 1.000 | 0 |
| Mutual attraction reciprocity | 1.03 | 1.03 | 1.03 | 1.000 | 0 |
| **All combined** | **0.67** | **0.63** | **0.62 to 0.86** | **0.997** | **5.8** |
| All combined, secular level on PRRI's scale (input check) | 0.49 | 0.51 | 0.51 to 0.69 | 0.997 | 5.7 |
| All combined, secular level from the GSS (input check) | 0.61 | 0.59 | 0.59 to 0.80 | 0.998 | 5.6 |
| All combined, secular level from CES (input check) | 0.83 | 0.75 | 0.72 to 1.02 | 0.996 | 7.2 |

**All combined, by search.**

| Search | Memphis | Pop-weighted | Rank ρ | Top 25 kept | Page's own 80% range |
|---|---|---|---|---|---|
| Man, women, progressive + secular (default) | 0.67 | 0.63 | 0.997 | 24 | ×0.51 to ×1.61 |
| Woman, men, progressive + secular | 0.61 | 0.58 | 0.996 | 24 | ×0.52 to ×1.61 |
| Man, women, conservative + Christian | 0.43 | 0.48 | 0.996 | 23 | ×0.47 to ×1.67 |
| Woman, men, conservative + Christian | 0.58 | 0.66 | 0.986 | 23 | ×0.50 to ×1.64 |
| Default without the degree filter | 0.67 | 0.65 | 0.999 | 24 | ×0.52 to ×1.61 |
| Default without politics or faith | 0.82 | 0.82 | 1.000 | 25 | ×0.58 to ×1.51 |
| Man 45, women 40 to 50, progressive + secular | 0.46 | 0.44 | 0.996 | 24 | ×0.51 to ×1.62 |

What stands out:

- **No single fix is large except the overlap; together they are.** The combined shift is about the size of the page's whole 80% range on the low side, and for conservative and Christian it lands below it. These shifts don't belong inside a wider range: each is a bias with a measured size and direction.
- **Conservative and Christian searches are hit hardest.** Faith shares for all adults overstate how many young singles are Christian (×0.68), degree holders are less often conservative (×0.80), and the overlap boost overshoots. Those three stack.
- **Older searches lose more, to the degree step and the secular share.** The page uses the 25-to-34 degree share and the same secular base at every age. For women 40 to 50 the degree share alone is ×0.78 and the secular share alone ×0.76 (GSS; ×0.79 with CES). CES parameters were only estimated at 25 to 35, so treat the CES-based rows of the older search loosely.
- **The secular-leaning level moves the number but not the ranking.** Taking it from PRRI's scale, the GSS or CES moves the combined result for the default search from ×0.49 to ×0.83, with the ranking unchanged (ρ 0.996 to 0.998). The page's level gives ×0.67, close to the GSS. This is uncertainty about the level, with no known direction of error, so it belongs in the range rather than in a correction.
- **Rankings are robust throughout.** The order of metros barely depends on how the funnel is built, so comparing metros on the page is far safer than reading off a single metro's absolute number.

## Step 2: replacing the overlap with data (applied)

The largest independence-type assumption is how politics and faith combine, so step 2 replaces it. Because the degree holders' odds ratio only makes sense with their own shares, the replacement also shifts politics and faith for degree holders. Concretely, the patch:

1. Removes the fixed ×1.5 boost. When politics and faith match, the share who fit both is a Plackett joint of the two shares with the CES odds ratio (1.82 for women and 2.26 for men for progressive with no religion; 2.05 and 1.86 for conservative with a Christian faith). With the degree filter on, it uses the degree holders' odds ratios (4.76, 4.10, 5.01 and 4.28). The joint can never exceed either share.
2. With the degree filter on, shifts the progressive odds by 1.38 (women) and 1.45 (men), the no-religion odds by 0.93 and 0.76, and the Christian odds by 1.20 and 1.30.
3. Carries the survey uncertainty into the range in place of the old ±15% on the boost. The odds ratio varies by ±15% (±24% among degree holders) and the degree shifts by ±10%, using the bootstrap spread on the log scale and two random dimensions the simulation didn't use yet.
4. Updates the methods text to match.

Nonbinary people get the average of the women's and men's figures, as elsewhere on the page.

**Checks.** The patched page gives the same result as the harness override, with the same constants, for every metro in all six searches, to 1e-9. No metro or gender exceeds the bound (52 to 297 metros did before, depending on the search). The patch applies cleanly to the current page, and the patched page loads with no errors and its self-check passes.

**Effect.** The 95% intervals come from rerunning the funnel with each of the 500 bootstrap draws of the CES estimates.

| Search | Memphis before (80% range) | Memphis after (80% range) | Change [95%] | Pop-weighted [95%] | Rank ρ |
|---|---|---|---|---|---|
| Man, women, progressive + secular | 216 (111 to 348) | 175 (93 to 274) | ×0.81 [0.70, 0.91] | ×0.77 [0.68, 0.85] | 0.997 |
| Woman, men, progressive + secular | 161 (83 to 260) | 125 (67 to 194) | ×0.78 [0.66, 0.91] | ×0.75 [0.65, 0.86] | 0.997 |
| Man, women, conservative + Christian | 219 (102 to 366) | 141 (66 to 231) | ×0.64 [0.55, 0.74] | ×0.70 [0.59, 0.82] | 0.997 |
| Woman, men, conservative + Christian | 228 (115 to 374) | 144 (72 to 229) | ×0.63 [0.55, 0.72] | ×0.69 [0.59, 0.79] | 0.998 |
| Default without the degree filter | 590 (304 to 951) | 436 (235 to 683) | ×0.74 [0.71, 0.77] | ×0.72 [0.70, 0.74] | 0.999 |
| Woman, men, cons. + Christian, no degree filter | 816 (412 to 1,346) | 591 (309 to 938) | ×0.72 [0.70, 0.75] | ×0.75 [0.71, 0.79] | 0.999 |

- **Where it bites.** For progressive + secular searches, the drop is largest where both shares are high, because that's where the old boost broke the bound. Among metros of a million or more, San Francisco drops to ×0.69, San Jose and Washington to ×0.71, and Seattle to ×0.72. Jacksonville and Oklahoma City drop only to ×0.92, and Greenville is unchanged. Metros under 35% Harris rise 4% on average (75 metros rise, by up to 19%, all with small counts), while metros over 55% Harris drop 25%. For conservative + Christian, the most Christian, most conservative metros drop most (Atlanta, Birmingham and Memphis ×0.63 to 0.64).
- **Rankings.** The top 10 keeps the same metros in five of the six searches, with neighbors occasionally swapping places; in the default search Miami replaces Denver at number 9. The mean metro moves 3 to 6 places out of 387.
- **The range.** It stays about as wide relative to the number (Memphis ×0.53 to ×1.57, from ×0.51 to ×1.61), now centered on the corrected estimate. The correction itself is well determined: its 95% interval (×0.70 to ×0.91 for the default) sits entirely below 1.

## Applied after step 2: degree share and cohabiting rate

`scripts/pums_singles.py` embeds two national corrections from the 2023 ACS microdata as the page's `PUMS` object, and `scripts/acs_to_json.py` now embeds each metro's B15001 degree share for all four age bands, not just 25 to 34.

- **Cohabiting.** The page removes the share of singles living with a partner for each B12002 age band and sex, instead of 15% everywhere: 26% of single women and 21% of single men at 25 to 29, falling to 6% and 12% at 55 to 59. The kids step's single-parent rate uses the same denominator.
- **Degree share.** For each year of the age range, the page takes the metro's B15001 share for that year's band and scales it by how often singles hold degrees against everyone in the band: 0.93 (women) and 0.91 (men) at 25 to 34, 0.79 and 0.73 at 35 to 44, 0.85 and 0.71 at 45 to 64, and 1.77 and 1.73 at 18 to 24 (singles 21 to 24 against everyone 18 to 24, who are mostly too young for a degree). The years are weighted by single people at each age. The degree uncertainty in the range still uses the 25-to-34 band's relative error.

Effect on top of step 2 (Memphis, and the population-weighted change across metros):

| Search | Memphis after step 2 | Memphis now | Pop-weighted | Spread across metros |
|---|---|---|---|---|
| Man, women 25 to 35 (default) | 175 | 140 (80% range 74 to 220) | ×0.80 | ×0.79 to ×0.83 |
| Woman, men 25 to 35 | 125 | 103 | ×0.82 | ×0.80 to ×0.86 |
| Default without the degree filter | 436 | 380 | ×0.87 | ×0.87 |
| Man 45, women 40 to 50 | 52 | 39 | ×0.67 | ×0.55 to ×1.21 |
| Woman 25, men 21 to 30 | 139 | 98 | ×0.76 | ×0.39 to ×1.24 |

For the default search this matches step 1's prediction (×0.92 for the degree share times ×0.87 for cohabiting ≈ ×0.80). Searches outside 25 to 35 now vary more between metros, because each metro's own degree share for those ages replaces its 25-to-34 share. For example, only 3.4% of men aged 18 to 24 in Provo have degrees, while in Elkhart and Prescott Valley older adults hold degrees more often than younger ones.

## The secular-leaning level

CES puts the no-religion share of single 25-to-35-year-olds 6 to 7 points above the page's secular-leaning share (`ces_metro_form.json`). Before calling that an input error, `scripts/structure/secular_level.py` checks it against the 2022 and 2024 General Social Survey, a probability sample (985 single respondents aged 25 to 35), and against PRRI, the page's own source for how metros differ.

| | All adults, no religion | Single women 25–35 | Single men 25–35 | Ratio, women / men (young singles over all adults) |
|---|---|---|---|---|
| PRRI county estimates (2023 Census of American Religion) | 23.1% | | | |
| GSS 2022 and 2024 | 26.6% [25.1, 28.2] | 37.5% [30.6, 44.6] | 44.8% [37.6, 52.2] | 1.41 / 1.68 |
| GSS, in-person interviews only | 21.7% | 33.5% | 41.3% | 1.54 / 1.90 |
| CES 2024, metro residents | 34.2% | 47.0% [43.2, 50.9] | 51.3% [47.3, 55.6] | 1.38 / 1.50 |
| The page (population-weighted across metros) | 23.1% (its PRRI input) | 40% | 44% | 1.73 at the average metro |

- **The gap is mostly CES's house effect.** CES finds about 7 points more unaffiliated adults than the GSS, and 11 more than PRRI's county model, so its young-single figure runs high for the same reason. Survey mode matters too: GSS respondents who answered online report more "none" than those interviewed in person (26.6% overall against 21.7%). Pew's 2023–24 Religious Landscape Study, at about 29% of adults, sits between.
- **The page's level sits in the middle of the credible range.** One estimate takes each survey's ratio of young singles to all adults, which cancels its house effect, and applies it to PRRI's 23.1%. That gives about 32% for single women and 35% to 39% for men. The GSS directly gives 37.5% and 44.8%; CES directly, 47% and 51%. The page's 40% and 44% fall between the first two. The men-minus-women gap of 4 points matches CES (4 points) and sits below the GSS (7 points).
- **There's no single right answer, so this belongs in the range.** The sources disagree because they measure differently, not because one has more data. Over that spread, the default search's combined result moves from ×0.49 to ×0.83. The page currently allows ±5 points on the base; about ±8 would cover the spread.
- **The share falls with age, and the page ignores it.** Among singles in the GSS, no religion drops from 37.5% (women) and 44.8% (men) at 25 to 35, to 34.6% and 43.6% at 36 to 45, 22.1% and 28.3% at 46 to 55, and 21.5% and 18.3% at 56 to 65. CES shows the same decline, less steeply (48% to 34% for women from 25–35 to 46–55). The 36–45 and 46–55 bands hold 643 and 509 GSS singles, so the steps are noisy, but the direction is clear in both surveys. For a search for women 40 to 50, this alone is ×0.76 (GSS) or ×0.79 (CES), and it's now part of "All combined" for the older search.
- **The definition matters more than the data.** If "secular-leaning" means no religion, the page is about right for young singles. If it also counts people who name a religion but attend services less than once a year, the GSS puts it at 59% of single women and 68% of single men aged 25 to 35, about 20 points above the page. That's a product decision, not a data question.

## What this does not cover

- **Untested assumptions.** These had no suitable microdata:
  - whether who's looking to date varies with degree or politics (Pew's dating-survey microdata)
  - whether your traits (age, height, degree, job, kids) combine multiplicatively in how interested people are
  - kids plans by degree
  - diet by faith beyond kosher and halal
  - app use by degree or politics
  - anything specific to nonbinary people, who are too few in CES to estimate

  Their effects are unknown, not zero.
- **Where the estimates come from.** The CES estimates are national and for ages 25 to 35; they are applied to every metro and age. CES is an opt-in online panel weighted to the population. Its vote geography checks out; its religious geography is weaker.
- **Choices of definition.** The definitions of progressive and secular-leaning are choices. The odds ratios barely change between the party and ideology versions (for example 1.8 vs 1.9 for women), and the step-1 results barely change between the narrow and broad secular versions (×0.83 vs ×0.84 in Memphis).
- **Speed-dating limits.** The data come from Columbia graduate students in 2002 to 2004 deciding in person; reciprocity on apps may differ.
- **Cohabiting rates are a floor.** PUMS cohabiting shares are a lower bound, so the cohabiting correction is if anything too small.

## Suggested next steps

1. **Step 2: done.** It fixes a logic error and puts the overlap on data, with its uncertainty in the range. The page now carries it; `scripts/structure/step2.mjs` checks that the page matches the patched copy exactly.
2. **Degree share by age band: done.** The page now uses B15001's band (18 to 24, 25 to 34, 35 to 44 or 45 to 64) for each year of the age range, weighted by singles at that age, times how often singles hold degrees against everyone in that band (PUMS).
3. **Cohabiting rates by sex and age band: done,** from PUMS in place of the flat 15%.
4. **Adjust faith shares to young singles** with the CES ratios, or say more prominently that Christian counts are likely high.
5. **Let the secular-leaning share fall with age**, by about ×0.9 at 36 to 45, ×0.65 to 0.7 at 46 to 55 and ×0.55 at 56 to 65 relative to 25 to 35 (the GSS and CES averaged; `scripts/structure/out/secular_level.json`). Keep the 40% base, but widen its uncertainty in the range from ±5 to about ±8 points, the spread between sources. Decide whether "secular-leaning" should include people who are nominally religious but rarely attend; if so, the base is about 20 points higher (59% of single women 25 to 35 and 68% of men in the GSS).
6. **Revisit the men's progressive offset** in the most Democratic metros.
7. **Then update the methods text.** The remaining structural assumptions that were tested (reciprocity, openness by politics) are small. Only add a judgment-based structural term to the range if the untested ones above turn out to matter.

## Reproducing

```
# data: CES 2024 CSV (ces24.csv), county24.csv, list1_2023.xlsx, speed.csv, csv_pus.zip in DATA_DIR
python3 scripts/structure/ces_estimates.py DATA_DIR     # out/ces_estimates.json, out/ces_draws.json
python3 scripts/structure/ces_metro_form.py DATA_DIR    # out/ces_metro_form.json
python3 scripts/structure/speed_dating.py DATA_DIR      # out/speed_dating.json
python3 scripts/structure/pums_degree.py DATA_DIR       # out/pums_degree.json (about 8 minutes)
python3 scripts/structure/secular_level.py DATA_DIR     # out/secular_level.json (needs the GSS 2022 and 2024 Stata files)
node scripts/structure/sensitivity.mjs                  # step 1, out/sensitivity.json
node scripts/structure/step2.mjs                        # step 2, out/step2.json and step2-values-joint.patch
python3 scripts/pums_singles.py csv_pus.zip --page atlas/index.html   # the page's PUMS object (run from scripts/)
```

The Node scripts need Playwright with Chromium. The Python scripts need pandas, numpy, statsmodels and openpyxl.
