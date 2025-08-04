# CSV Product & Metafield Updater

This Shopify app allows you to bulk update product properties and metafields using CSV files. The app uses the product handle as an identifier to find and update products. It supports two CSV formats: product properties and metafields.

## Features

- **Dual Format Support**: Update product properties or metafields
- **CSV Upload**: Drag and drop or select CSV files for processing
- **Preview Mode**: Test your changes before applying them (dry run)
- **Batch Processing**: Handles large CSV files with rate limiting
- **Error Handling**: Detailed error reporting for failed updates
- **Progress Tracking**: Real-time progress updates during processing
- **Validation**: Comprehensive validation of CSV data and values
- **Auto-Detection**: Automatically detects CSV format (products vs metafields)

## CSV Formats

The app supports two CSV formats that are automatically detected:

### 1. Product Properties Format

Update core product information and the custom components metafield:

| Column | Description | Required | Example |
|--------|-------------|----------|---------|
| `Handle` | Product handle (URL slug) | Yes | `red-snowboard` |
| `Title` | Product title | No | `Red Snowboard` |
| `Body (HTML)` | Product description | No | `<p>Description</p>` |
| `Vendor` | Product vendor | No | `Acme Sports` |
| `Type` | Product type | No | `Snowboard` |
| `Tags` | Comma-separated tags | No | `winter,sports` |
| `Published` | Published status | No | `true` or `false` |
| `Components (product.metafields.custom.components)` | Components metafield | No | `comp1,comp2` |

#### Example Product Properties CSV

```csv
Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Components (product.metafields.custom.components)
red-snowboard,Red Snowboard,"<p>A high-quality red snowboard.</p>",Acme Sports,Snowboard,"winter,sports",true,component1;component2
blue-snowboard,Blue Snowboard,"<p>A sleek blue snowboard.</p>",Acme Sports,Snowboard,"winter,sports,advanced",false,component1;component3
```

### 2. Metafields Format

Update custom metafields for products:

| Column | Description | Required | Example |
|--------|-------------|----------|---------|
| `handle` | Product handle (URL slug) | Yes | `red-snowboard` |
| `namespace` | Metafield namespace | Yes | `custom` |
| `key` | Metafield key | Yes | `color` |
| `value` | Metafield value | Yes | `red` |
| `type` | Metafield type | No* | `single_line_text_field` |

*If type is not provided, it defaults to `single_line_text_field`

#### Example Metafields CSV

```csv
handle,namespace,key,value,type
red-snowboard,custom,color,red,single_line_text_field
red-snowboard,custom,material,fiberglass,single_line_text_field
red-snowboard,custom,weight,5.2,number_decimal
blue-snowboard,custom,color,blue,single_line_text_field
blue-snowboard,custom,eco_friendly,true,boolean
green-snowboard,custom,certification_date,2024-01-15,date
```

## Supported Metafield Types

- `single_line_text_field` - Single line text
- `multi_line_text_field` - Multi-line text
- `number_integer` - Integer numbers
- `number_decimal` - Decimal numbers
- `date` - Date values (YYYY-MM-DD)
- `date_time` - Date and time values
- `boolean` - True/false values
- `color` - Color hex codes (#RRGGBB)
- `weight` - Weight values
- `volume` - Volume values
- `dimension` - Dimension values
- `rating` - Rating values
- `json` - JSON objects
- `money` - Money values
- `file_reference` - File references
- `page_reference` - Page references
- `product_reference` - Product references
- `variant_reference` - Variant references
- `collection_reference` - Collection references
- `url` - URL values

## How to Use

1. **Navigate to CSV Updater**: Click on "CSV Metafield Updater" in the app navigation
2. **Prepare Your CSV**: Create a CSV file in either product properties or metafields format
3. **Upload CSV**: Drag and drop your CSV file or click to select
4. **Auto-Detection**: The app will automatically detect your CSV format
5. **Choose Mode**:
   - **Preview Changes**: Test your updates without applying them
   - **Apply Changes**: Actually update the products/metafields
6. **Process**: Click the "Preview CSV" or "Process CSV" button
7. **Review Results**: Check the results table for successful updates and any errors

## Validation Rules

### Handle Format
- Must contain only lowercase letters, numbers, and hyphens
- Example: `red-snowboard`, `product-123`

### Namespace and Key Format
- Must contain only letters, numbers, underscores, and hyphens
- Example: `custom`, `my_namespace`, `product-info`

### Value Validation by Type
- **number_integer**: Must be a valid integer (`123`, `-456`)
- **number_decimal**: Must be a valid decimal (`12.34`, `-5.67`)
- **boolean**: Must be `true`, `false`, `1`, or `0`
- **date**: Must be a valid date (`2024-01-15`)
- **color**: Must be a valid hex color (`#FF0000`, `#abc`)
- **url**: Must be a valid URL (`https://example.com`)
- **json**: Must be valid JSON (`{"key": "value"}`)

## Error Handling

The app provides detailed error messages for:
- Missing required fields
- Invalid handle formats
- Products not found
- Invalid metafield types
- Value validation failures
- API errors

## Rate Limiting

The app processes products in batches of 5 with a 500ms delay between batches to respect Shopify's API rate limits.

## Sample Files

Two sample CSV files are included in the app directory to help you get started:
- `sample-product-properties.csv` - Example product properties format
- `sample-metafields.csv` - Example metafields format

## Permissions Required

The app requires the following Shopify permissions:
- `write_products` - To access and update products
- `write_metafields` - To create and update metafields

## Troubleshooting

### Common Issues

1. **Product not found**: Ensure the handle exactly matches the product handle in Shopify
2. **Invalid metafield type**: Check that the type is one of the supported types
3. **Value validation failed**: Ensure the value format matches the metafield type requirements
4. **CSV parsing errors**: Check that your CSV has the correct headers and format

### Tips

- Use the preview mode first to test your CSV
- Keep CSV files under 5MB for best performance
- Ensure product handles are exactly as they appear in Shopify (case-sensitive)
- Use UTF-8 encoding for CSV files with special characters
