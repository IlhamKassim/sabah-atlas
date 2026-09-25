import pandas as pd
import pytest

from atlas_core.settings import get_settings


@pytest.fixture(scope="session")
def gold():
    path = get_settings().gold / "observation.parquet"
    if not path.exists():
        pytest.skip("gold not built; run `uv run atlas build`")
    return pd.read_parquet(path)
