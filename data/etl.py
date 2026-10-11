import argparse
import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "raw"
PROCESSED_DIR = ROOT / "processed"
DEFAULT_INPUT = RAW_DIR / "olist_order_reviews_dataset.csv"
OUTPUT_FILE = PROCESSED_DIR / "metrics.json"

COLUMN_ALIASES = {
    "date": (
        "created_at",
        "created_date",
        "date",
        "datetime",
        "timestamp",
        "review_date",
        "review_creation_date",
        "order_date",
        "purchase_date",
    ),
    "category": (
        "category",
        "category_name",
        "product_category",
        "product_category_name",
        "product_category_name_english",
        "topic",
        "department",
        "type",
    ),
    "rating": ("review_score", "rating", "rating_score", "score"),
    "status": ("status", "ticket_status", "order_status", "review_status"),
    "priority": ("priority", "ticket_priority", "urgency"),
}


def normalize_name(value: str) -> str:
    without_accents = unicodedata.normalize("NFKD", value)
    ascii_name = without_accents.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")


def find_column(
    columns: list[str],
    requested: str | None,
    aliases: tuple[str, ...],
    label: str,
    required: bool,
) -> str | None:
    normalized_columns = {normalize_name(column): column for column in columns}
    if requested:
        column = normalized_columns.get(normalize_name(requested))
        if column is None:
            raise ValueError(
                f"A coluna informada para {label!r} ({requested!r}) não existe. "
                f"Colunas disponíveis: {', '.join(columns)}"
            )
        return column

    for alias in aliases:
        if alias in normalized_columns:
            return normalized_columns[alias]

    if required:
        raise ValueError(
            f"Não foi possível identificar a coluna de {label}. "
            f"Informe-a com --{label}-column. "
            f"Colunas disponíveis: {', '.join(columns)}"
        )
    return None


def normalize_status(value: str) -> str:
    normalized = normalize_name(value)
    if normalized in {"open", "new", "pending", "aberto", "aberta", "novo", "nova"}:
        return "open"
    if normalized in {
        "in_progress",
        "inprogress",
        "processing",
        "em_andamento",
        "em_progresso",
    }:
        return "in_progress"
    if normalized in {
        "closed",
        "resolved",
        "completed",
        "complete",
        "fechado",
        "fechada",
        "resolvido",
        "resolvida",
    }:
        return "closed"
    return normalized


def normalize_priority(value: str) -> str:
    normalized = normalize_name(value)
    if normalized in {"urgent", "critical", "urgente", "critica", "critico"}:
        return "high"
    if normalized in {"normal", "medium", "moderate", "media", "medio"}:
        return "medium"
    if normalized in {"baixa", "baixo"}:
        return "low"
    return normalized


def load_order_categories(raw_dir: Path) -> pd.Series | None:
    """Mapeia order_id -> categoria principal (item mais frequente do pedido).

    Usa os CSVs auxiliares do dataset Olist quando estão em data/raw. Retorna
    None se algum arquivo estiver ausente, para o ETL seguir sem categorias.
    """
    items_file = raw_dir / "olist_order_items_dataset.csv"
    products_file = raw_dir / "olist_products_dataset.csv"
    if not items_file.is_file() or not products_file.is_file():
        return None
    items = pd.read_csv(items_file, usecols=["order_id", "product_id"])
    products = pd.read_csv(
        products_file, usecols=["product_id", "product_category_name"]
    )
    merged = items.merge(products, on="product_id", how="left").dropna(
        subset=["product_category_name"]
    )
    return (
        merged.groupby("order_id")["product_category_name"]
        .agg(lambda values: values.value_counts().index[0])
    )


def count_values(values: pd.Series, output_name: str) -> list[dict[str, str | int]]:
    counts = values.value_counts().rename_axis(output_name).reset_index(name="count")
    return counts.to_dict(orient="records")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Gera métricas de um CSV baixado do Kaggle."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Caminho do CSV de origem (padrão: {DEFAULT_INPUT})",
    )
    parser.add_argument("--date-column", help="Nome da coluna de data")
    parser.add_argument("--category-column", help="Nome da coluna de categoria")
    parser.add_argument("--rating-column", help="Nome da coluna de nota/avaliação")
    parser.add_argument("--status-column", help="Nome da coluna de status")
    parser.add_argument("--priority-column", help="Nome da coluna de prioridade")
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(
            f"Arquivo CSV não encontrado: {args.input}\n"
            f"Coloque o dataset em {DEFAULT_INPUT} ou use --input para informar "
            "outro caminho."
        )

    try:
        dataframe = pd.read_csv(args.input, sep=None, engine="python")
    except (OSError, UnicodeError, pd.errors.EmptyDataError, pd.errors.ParserError) as error:
        raise SystemExit(f"Não foi possível ler o CSV {args.input}: {error}") from error

    if dataframe.empty:
        raise SystemExit(f"O CSV {args.input} não contém registros.")

    try:
        columns = list(dataframe.columns)
        selected_columns = {
            "date": find_column(
                columns,
                args.date_column,
                COLUMN_ALIASES["date"],
                "date",
                True,
            ),
            "category": find_column(
                columns,
                args.category_column,
                COLUMN_ALIASES["category"],
                "category",
                False,
            ),
            "rating": find_column(
                columns,
                args.rating_column,
                COLUMN_ALIASES["rating"],
                "rating",
                False,
            ),
            "status": find_column(
                columns,
                args.status_column,
                COLUMN_ALIASES["status"],
                "status",
                False,
            ),
            "priority": find_column(
                columns,
                args.priority_column,
                COLUMN_ALIASES["priority"],
                "priority",
                False,
            ),
        }
    except ValueError as error:
        raise SystemExit(str(error)) from error

    if not selected_columns["category"] and not selected_columns["rating"]:
        raise SystemExit(
            "Não foi encontrada uma coluna de categoria ou avaliação. "
            "Informe uma com --category-column ou --rating-column."
        )

    dataframe["__date"] = pd.to_datetime(
        dataframe[selected_columns["date"]], errors="coerce"
    )
    valid_rows = dataframe["__date"].notna()
    if selected_columns["category"]:
        dataframe["__category"] = (
            dataframe[selected_columns["category"]].astype("string").str.strip()
        )
        valid_rows &= dataframe["__category"].notna() & dataframe["__category"].ne("")
    if selected_columns["rating"]:
        dataframe["__rating"] = pd.to_numeric(
            dataframe[selected_columns["rating"]], errors="coerce"
        )
        valid_rows &= dataframe["__rating"].notna()

    skipped_rows = int((~valid_rows).sum())
    dataframe = dataframe.loc[valid_rows].copy()

    if dataframe.empty:
        raise SystemExit(
            "Nenhum registro válido: verifique as colunas de data e categoria "
            "e o formato dos valores."
        )

    if skipped_rows:
        print(
            f"Aviso: {skipped_rows} registro(s) foram ignorados por não terem "
            "data, categoria ou avaliação válida."
        )

    dataframe["__status"] = ""
    dataframe["__priority"] = ""
    if selected_columns["status"]:
        statuses = dataframe[selected_columns["status"]].astype("string").str.strip()
        dataframe["__status"] = statuses.fillna("").map(normalize_status)
    if selected_columns["priority"]:
        priorities = dataframe[selected_columns["priority"]].astype("string").str.strip()
        dataframe["__priority"] = priorities.fillna("").map(normalize_priority)

    order_column = next(
        (column for column in dataframe.columns if normalize_name(column) == "order_id"),
        None,
    )
    order_categories = (
        load_order_categories(args.input.parent) if order_column else None
    )
    by_day: list[dict[str, object]] = []
    dated_reviews = dataframe.assign(
        __day=dataframe["__date"].dt.strftime("%Y-%m-%d")
    )
    for day, day_reviews in dated_reviews.groupby("__day", sort=True):
        day_metrics: dict[str, object] = {
            "date": day,
            "count": int(len(day_reviews)),
        }
        if selected_columns["rating"]:
            ratings = day_reviews["__rating"].value_counts().sort_index(
                ascending=False
            )
            day_metrics["ratings"] = [
                {
                    "rating": (
                        int(rating) if float(rating).is_integer() else float(rating)
                    ),
                    "count": int(rating_count),
                }
                for rating, rating_count in ratings.items()
            ]
        by_day.append(day_metrics)
    monthly_reviews = dataframe.assign(
        __month=dataframe["__date"].dt.strftime("%Y-%m")
    ).groupby("__month")
    by_month = [
        {
            "month": month,
            "count": int(month_data["__date"].size),
            "average_rating": (
                round(float(month_data["__rating"].mean()), 2)
                if selected_columns["rating"]
                else None
            ),
        }
        for month, month_data in monthly_reviews
    ]
    if selected_columns["category"]:
        by_category = count_values(dataframe["__category"], "category")[:10]
    else:
        by_category = []
        if order_categories is not None:
            categories = dataframe[order_column].map(order_categories)
            grouped = dataframe.assign(__category=categories).dropna(subset=["__category"])
            grouped = grouped.groupby("__category")
            by_category = sorted(
                (
                    {
                        "category": category,
                        "count": int(group["__date"].size),
                        "average_rating": (
                            round(float(group["__rating"].mean()), 2)
                            if selected_columns["rating"]
                            else None
                        ),
                    }
                    for category, group in grouped
                ),
                key=lambda item: (-item["count"], item["category"]),
            )[:10]
    by_rating = (
        count_values(dataframe["__rating"].astype(str), "rating")
        if selected_columns["rating"]
        else []
    )
    statuses = dataframe.loc[dataframe["__status"] != "", "__status"]
    priorities = dataframe.loc[dataframe["__priority"] != "", "__priority"]
    is_reviews_dataset = (
        selected_columns["rating"]
        and normalize_name(selected_columns["rating"]) == "review_score"
    )

    metrics = {
        "generated_at": pd.Timestamp.now().isoformat(),
        "source_file": args.input.name,
        "record_type": "reviews" if is_reviews_dataset else "records",
        "summary": {
            "total_records": int(len(dataframe)),
            "average_rating": (
                round(float(dataframe["__rating"].mean()), 2)
                if selected_columns["rating"]
                else None
            ),
        },
        "by_day": by_day,
        "by_month": by_month,
        "by_category": by_category,
        "by_rating": by_rating,
        "by_status": count_values(statuses, "status"),
        "by_priority": count_values(priorities, "priority"),
    }

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as output:
        json.dump(metrics, output, ensure_ascii=False, indent=2)

    print(f"Métricas geradas com {len(dataframe)} registro(s): {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
