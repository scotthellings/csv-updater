# Product Properties CSV - Metafields Guide

This guide explains how to use the enhanced product properties CSV handler that now supports additional metafields for chemical products.

## Supported Metafields

The CSV handler now supports the following metafields in addition to standard product properties:

### 1. **Components** (existing)
- **Column Name**: `Components (product.metafields.custom.components)`
- **Type**: JSON
- **Description**: Product components with concentration, matrix, and CAS information
- **Format**: JSON array or semicolon-separated values
- **Example**: `[{"component":"Benzene","concentration":"1000 μg/mL","matrix":"Methanol","cas":"71-43-2"}]`

### 2. **Shipping Info** (new)
- **Column Name**: `Shipping Info (product.metafields.custom.shipping_info)`
- **Type**: Single line text
- **Description**: Shipping requirements and conditions
- **Example**: `Ships at ambient temperature`, `Requires cold shipping`

### 3. **Unit/Packs** (new)
- **Column Name**: `Unit/Packs (product.metafields.custom.unit_packs)`
- **Type**: Single line text
- **Description**: Package size and unit information
- **Example**: `1 mL vial`, `5 mL ampoule`, `10 x 1 mL vials`

### 4. **COA (Certificate of Analysis)** (new)
- **Column Name**: `COA (product.metafields.custom.coa)`
- **Type**: URL or Single line text
- **Description**: Certificate of Analysis reference or URL
- **Example**: `https://example.com/coa/product-001.pdf`, `COA-2024-001`

### 5. **SDS (Safety Data Sheet)** (new)
- **Column Name**: `SDS (product.metafields.custom.sds)`
- **Type**: URL or Single line text
- **Description**: Safety Data Sheet reference or URL
- **Example**: `https://example.com/sds/benzene.pdf`, `SDS-BENZENE-001`

### 6. **Storage Conditions** (new)
- **Column Name**: `Storage Conditions (product.metafields.custom.storage_conditions)`
- **Type**: Single line text
- **Description**: Required storage conditions
- **Example**: `Store at 2-8°C`, `Room temperature storage`, `Store at -20°C`

### 7. **Volume** (new)
- **Column Name**: `Volume (product.metafields.custom.volume)`
- **Type**: Single line text
- **Description**: Product volume
- **Example**: `1 mL`, `5 mL`, `10 mL`

### 8. **Expiration Months** (new)
- **Column Name**: `expiration months (product.metafields.custom.expiration_months)`
- **Type**: Number (integer)
- **Description**: Expiration period in months
- **Example**: `12`, `24`, `36`

## CSV Format

### Required Columns
- `Handle` - Product handle (required)

### Optional Standard Product Columns
- `Title` - Product title
- `Body (HTML)` - Product description in HTML
- `Vendor` - Product vendor
- `Type` - Product type
- `Tags` - Comma-separated tags
- `Published` - true/false or 1/0

### Optional Metafield Columns
All metafield columns are optional. Include only the ones you want to update.

## Usage Examples

### Example 1: Chemical Standard with Full Metafields
```csv
Handle,Title,Components (product.metafields.custom.components),Shipping Info (product.metafields.custom.shipping_info),Unit/Packs (product.metafields.custom.unit_packs),COA (product.metafields.custom.coa),SDS (product.metafields.custom.sds),Storage Conditions (product.metafields.custom.storage_conditions),Volume (product.metafields.custom.volume),expiration months (product.metafields.custom.expiration_months)
benzene-1000,"Benzene Standard, 1000 μg/mL","[{""component"":""Benzene"",""concentration"":""1000 μg/mL"",""matrix"":""Methanol"",""cas"":""71-43-2""}]",Ships at ambient temperature,1 mL vial,https://example.com/coa/benzene-1000.pdf,https://example.com/sds/benzene.pdf,Store at 2-8°C,1 mL,24
```

### Example 2: Using Alternative Column Names
The system supports multiple column name formats:
- `Shipping Info` (short form)
- `shippingInfo` (camelCase)
- `Shipping Info (product.metafields.custom.shipping_info)` (full form)

### Example 3: Components in Semicolon Format
```csv
Handle,Components (product.metafields.custom.components)
ethanol-cal,Ethanol; 2000 μg/mL; Water; 64-17-5
```

## Data Validation

### Automatic Validations
- **Expiration Months**: Must be a positive integer
- **URLs**: COA and SDS fields starting with http:// or https:// are treated as URLs
- **Handle**: Must contain only lowercase letters, numbers, and hyphens
- **μg Symbol**: Automatically fixes corrupted μg symbols (�g or ?g → μg)

### Data Processing
- **Encoding Issues**: Automatically fixes common encoding problems
- **URL Formatting**: Adds https:// prefix to URLs missing protocol
- **Number Formatting**: Converts expiration months to proper integer format
- **JSON Validation**: Validates and formats Components JSON

## Error Handling

The system provides detailed error messages for:
- Invalid handle formats
- Invalid expiration months (non-numeric values)
- Missing required fields
- JSON parsing errors in Components field

## Rate Limiting

The system includes enhanced rate limiting:
- Adaptive batch sizing based on dataset size
- Progressive delays between batches
- Automatic retry logic for rate limit errors
- Conservative processing to stay within Shopify API limits

## Testing

Use the provided `sample-product-properties.csv` file to test the new functionality with sample chemical products.
