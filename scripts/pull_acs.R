# Pull the ACS tables the atlas needs, one row per metro (CBSA).
# Needs a Census API key: tidycensus::census_api_key("...", install = TRUE)
library(tidycensus)
library(dplyr)

acs <- get_acs(geography = "cbsa", table = "B12002", year = 2023, survey = "acs5", output = "wide") |>
  select(GEOID, NAME, ends_with("E")) |>
  inner_join(
    get_acs(geography = "cbsa", table = "B15001", year = 2023, survey = "acs5", output = "wide") |>
      select(GEOID, ends_with("E"), -NAME),
    by = "GEOID"
  )
dir.create("data", showWarnings = FALSE)
write.csv(acs, "data/metro_acs_2023.csv", row.names = FALSE)

# Variable labels, so the converter can find each cell without hard-coded numbers
load_variables(2023, "acs5") |>
  filter(grepl("^B1(2002|5001)_", name)) |>
  select(name, label) |>
  write.csv("data/acs_variables_2023.csv", row.names = FALSE)
