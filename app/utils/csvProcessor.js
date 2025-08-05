import Papa from 'papaparse';

/**
 * Fix common CSV issues with multi-line content in quoted fields
 */
function fixMultilineCSV(csvText) {
  try {
    const lines = csvText.split('\n');
    const fixedLines = [];
    let currentLine = '';
    let inQuotedField = false;
    let quoteCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Count quotes in this line
      const quotes = (line.match(/"/g) || []).length;
      quoteCount += quotes;

      // If we're in a quoted field or starting one
      if (inQuotedField || (quoteCount % 2 === 1)) {
        if (currentLine) {
          // Replace newline with space to keep content on one line
          currentLine += ' ' + line;
        } else {
          currentLine = line;
        }

        // Check if we're closing the quoted field
        if (quoteCount % 2 === 0) {
          inQuotedField = false;
          fixedLines.push(currentLine);
          currentLine = '';
          quoteCount = 0;
        } else {
          inQuotedField = true;
        }
      } else {
        // Normal line, not in quoted field
        fixedLines.push(line);
        quoteCount = 0;
      }
    }

    // If we have a remaining line, add it
    if (currentLine) {
      fixedLines.push(currentLine);
    }

    return fixedLines.join('\n');
  } catch (error) {
    console.warn('Failed to fix multiline CSV, using original:', error.message);
    return csvText;
  }
}

/**
 * Preprocess CSV to handle component fields that may contain unquoted commas
 * This function attempts to detect and quote component fields that contain chemical names with commas
 */
function preprocessCSVForComponents(csvText) {
  try {
    const lines = csvText.split('\n');
    if (lines.length === 0) return csvText;

    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));

    // Find component column index
    const componentColumnIndex = headers.findIndex(header =>
      header.toLowerCase().includes('component')
    );

    if (componentColumnIndex === -1) {
      return csvText; // No component column found
    }

    console.log(`Found component column at index ${componentColumnIndex}: "${headers[componentColumnIndex]}"`);

    // Process data rows
    const processedLines = [headerLine]; // Keep header as-is

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        processedLines.push(line);
        continue;
      }

      // Split the line, but be careful about quoted fields
      const fields = [];
      let currentField = '';
      let inQuotes = false;
      let j = 0;

      while (j < line.length) {
        const char = line[j];

        if (char === '"') {
          inQuotes = !inQuotes;
          currentField += char;
        } else if (char === ',' && !inQuotes) {
          fields.push(currentField);
          currentField = '';
        } else {
          currentField += char;
        }
        j++;
      }
      fields.push(currentField); // Add the last field

      // Check if the component field looks like it might be truncated
      if (fields.length > componentColumnIndex) {
        const componentValue = fields[componentColumnIndex].trim();

        // If the component value is just a number and very short, it might be truncated
        // due to an unquoted comma in a chemical name
        if (/^\d+$/.test(componentValue) && componentValue.length < 3) {
          console.warn(`Row ${i + 1}: Component value "${componentValue}" appears truncated. Original line: ${line.substring(0, 100)}...`);

          // Try to reconstruct the component field by looking for chemical name patterns
          // This is a heuristic approach - look for patterns like "1,1,2,2-Tetrachloroethane"
          const remainingFields = fields.slice(componentColumnIndex + 1);
          let reconstructedComponent = componentValue;
          let fieldsToMerge = 0;

          // Look for continuation patterns (number, number, chemical name parts)
          for (let k = 0; k < remainingFields.length; k++) {
            const nextField = remainingFields[k].trim();

            // If next field is a single digit, merge it
            if (/^\d+$/.test(nextField)) {
              reconstructedComponent += ',' + nextField;
              fieldsToMerge++;
            }
            // If next field looks like a chemical name part (contains letters, hyphens, etc.)
            else if (/^[a-zA-Z0-9-]+$/.test(nextField) && nextField.length > 1) {
              reconstructedComponent += ',' + nextField;
              fieldsToMerge++;
              // This is likely the end of the chemical name, so break
              break;
            }
            // If we hit something that looks like a vendor name or other field, stop
            else if (/^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(nextField)) {
              break;
            }
            // If it's something else entirely, stop
            else {
              break;
            }
          }

          if (fieldsToMerge > 0) {
            console.log(`Reconstructed component: "${reconstructedComponent}"`);

            // Rebuild the fields array with the reconstructed component
            const newFields = [
              ...fields.slice(0, componentColumnIndex),
              `"${reconstructedComponent}"`, // Quote the reconstructed component
              ...fields.slice(componentColumnIndex + 1 + fieldsToMerge)
            ];

            processedLines.push(newFields.join(','));
            continue;
          }
        }
      }

      // If no reconstruction was needed, keep the original line
      processedLines.push(line);
    }

    return processedLines.join('\n');
  } catch (error) {
    console.warn('Error in CSV preprocessing:', error);
    return csvText; // Return original if preprocessing fails
  }
}

/**
 * Parse CSV file and validate the structure
 * Expected CSV format can be either:
 * 1. Product properties: Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Components (product.metafields.custom.components)
 * 2. Metafields: handle,namespace,key,value,type
 */
export async function parseCSV(file, options = {}) {
  try {
    // Convert File to text - file is a File object from FormData
    let csvText = await file.text();

    console.log('Starting CSV parsing...');
    console.log(`CSV file size: ${csvText.length} characters`);

    // For preview mode, limit the number of rows to prevent memory issues
    const isPreview = options.preview || false;
    const maxPreviewRows = 25; // Limit preview to first 25 rows for better memory usage

    // Clean up the CSV text to handle common issues
    csvText = csvText
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')   // Handle old Mac line endings
      .trim(); // Remove leading/trailing whitespace

    // Try to fix common CSV issues with multi-line content
    // This is a heuristic approach for handling unescaped newlines in quoted fields
    csvText = fixMultilineCSV(csvText);

    // Preprocess CSV to handle potential issues with unquoted component fields containing commas
    csvText = preprocessCSVForComponents(csvText);

    // If preview mode, limit the CSV text to first N rows
    if (isPreview) {
      const lines = csvText.split('\n');
      if (lines.length > maxPreviewRows + 1) { // +1 for header
        csvText = lines.slice(0, maxPreviewRows + 1).join('\n');
        console.log(`Preview mode: Processing first ${maxPreviewRows} rows out of ${lines.length - 1} total rows for memory efficiency`);
      }
    }

    // Parse CSV synchronously since we already have the text
    let results;

    // First attempt with standard configuration
    try {
      results = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // Keep everything as strings for validation
        skipEmptyLines: 'greedy',
        newline: '', // Auto-detect line endings
        quoteChar: '"', // Handle quoted fields properly
        escapeChar: '"', // Handle escaped quotes
        delimiter: ',', // Explicit comma delimiter
        transformHeader: (header) => header.trim(), // Trim header whitespace
        fastMode: false, // Disable fast mode for better error handling
        delimitersToGuess: [',', '\t', '|', ';'], // Try different delimiters if comma fails
        transform: (value, field) => {
          // Special handling for component fields that might contain unquoted commas
          if (field && field.toLowerCase().includes('component') && value) {
            // If this looks like a truncated chemical name (starts with digit and is very short),
            // log a warning about potential CSV parsing issues
            if (/^\d+$/.test(value.trim()) && value.trim().length < 3) {
              console.warn(`Potential CSV parsing issue detected for field "${field}": value "${value}" may be truncated due to unquoted commas. Consider quoting this field in the CSV.`);
            }
          }
          return value;
        }
      });
    } catch (parseError) {
      console.warn('Standard CSV parsing failed, trying fallback method:', parseError.message);

      // Fallback: Try with more lenient settings
      results = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        fastMode: false,
        delimiter: ',',
        quoteChar: '"',
        escapeChar: '"',
        transformHeader: (header) => header.trim(),
        // More lenient settings
        skipFirstNLines: 0,
        preview: 0,
        worker: false,
        comments: false,
        step: undefined,
        complete: undefined,
        error: undefined,
        download: false,
        transform: (value, field) => {
          // Same transform logic for fallback
          if (field && field.toLowerCase().includes('component') && value) {
            if (/^\d+$/.test(value.trim()) && value.trim().length < 3) {
              console.warn(`Potential CSV parsing issue detected for field "${field}": value "${value}" may be truncated due to unquoted commas. Consider quoting this field in the CSV.`);
            }
          }
          return value;
        }
      });
    }

    if (results.errors.length > 0) {
      console.error('CSV parsing errors:', results.errors);
      console.error('CSV preview (first 500 chars):', csvText.substring(0, 500));
      console.error('Number of lines in CSV:', csvText.split('\n').length);

      // Try to provide more helpful error messages
      const errorMessages = results.errors.map(error => {
        let message = error.message || 'Unknown parsing error';
        if (error.row !== undefined) {
          message = `Row ${error.row + 1}: ${message}`;
        }
        if (error.code) {
          message += ` (Code: ${error.code})`;
        }
        return message;
      });

      // If we have some data despite errors, log it for debugging
      if (results.data && results.data.length > 0) {
        console.log(`Parsed ${results.data.length} rows despite errors`);
        console.log('First row keys:', Object.keys(results.data[0] || {}));
      }

      throw new Error(`CSV parsing errors: ${errorMessages.join(', ')}`);
    }

    const validatedData = validateCSVData(results.data, { preview: isPreview });

    return {
      data: validatedData,
      errors: results.errors,
      meta: results.meta
    };
  } catch (error) {
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Detect CSV format based on headers
 */
export function detectCSVFormat(data) {
  if (data.length === 0) return 'unknown';

  const headers = Object.keys(data[0]).map(h => h.toLowerCase());

  // Check for product properties format
  const productHeaders = ['handle', 'title'];
  const hasProductHeaders = productHeaders.every(header =>
    headers.some(h => h.includes(header))
  );

  // Check for metafields format
  const metafieldHeaders = ['handle', 'namespace', 'key', 'value'];
  const hasMetafieldHeaders = metafieldHeaders.every(header =>
    headers.includes(header)
  );

  if (hasProductHeaders) return 'products';
  if (hasMetafieldHeaders) return 'metafields';
  return 'unknown';
}

/**
 * Validate CSV data structure and required fields
 */
export function validateCSVData(data, options = {}) {
  const format = detectCSVFormat(data);
  const isPreview = options.preview || false;

  if (format === 'unknown') {
    throw new Error('Unknown CSV format. Expected either product properties or metafields format.');
  }

  // In preview mode, add a note about limited validation
  if (isPreview && data.length >= 25) {
    console.log('Preview mode: Validating first 25 rows only. Full validation will occur during actual processing.');
  }

  if (format === 'products') {
    return validateProductCSVData(data);
  } else {
    return validateMetafieldCSVData(data);
  }
}

/**
 * Validate product properties CSV data
 */
export function validateProductCSVData(data) {
  const validatedRows = [];
  const errors = [];

  data.forEach((row, index) => {
    const rowErrors = [];

    // Handle is required
    if (!row.Handle && !row.handle) {
      rowErrors.push(`Row ${index + 1}: Missing required field 'Handle'`);
    }

    const handle = row.Handle || row.handle;

    // Validate handle format (Shopify allows a wide range of URL-safe characters including parentheses and ampersands)
    if (handle && !/^[a-z0-9_.\-()&]+$/.test(handle.trim())) {
      rowErrors.push(`Row ${index + 1}: Invalid handle format. Handle contains unsupported characters.`);
    }

    // Validate Published field if present
    if (row.Published && !['true', 'false', '1', '0', 'TRUE', 'FALSE'].includes(row.Published.toString().toLowerCase())) {
      rowErrors.push(`Row ${index + 1}: Published field must be true/false or 1/0`);
    }

    // Validate expiration months field if present (should be a number)
    const expirationMonths = row['expiration months (product.metafields.custom.expiration_months)'] || row.expirationMonths || row['expiration months'];
    if (expirationMonths && !/^\d+$/.test(expirationMonths.toString().trim())) {
      rowErrors.push(`Row ${index + 1}: Expiration months must be a positive integer`);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      const validatedRow = {
        handle: handle ? handle.trim() : '',
        title: fixEncodingIssues(row.Title || ''),
        bodyHtml: fixEncodingIssues(row['Body (HTML)'] || row.bodyHtml || ''),
        vendor: fixEncodingIssues(row.Vendor || ''),
        productType: fixEncodingIssues(row.Type || ''),
        tags: fixEncodingIssues(row.Tags || ''),
        published: row.Published ? ['true', '1', 'TRUE'].includes(row.Published.toString()) : undefined,

        // Existing metafields
        components: fixEncodingIssues(row['Components (product.metafields.custom.components)'] || row.components || ''),

        // New metafields
        shippingInfo: fixEncodingIssues(row['Shipping Info (product.metafields.custom.shipping_info)'] || row.shippingInfo || row['Shipping Info'] || ''),
        unitPacks: fixEncodingIssues(row['Unit/Packs (product.metafields.custom.unit_packs)'] || row.unitPacks || row['Unit/Packs'] || ''),
        coa: fixEncodingIssues(row['COA (product.metafields.custom.coa)'] || row.coa || row.COA || ''),
        sds: fixEncodingIssues(row['SDS (product.metafields.custom.sds)'] || row.sds || row.SDS || ''),
        storageConditions: fixEncodingIssues(row['Storage Conditions (product.metafields.custom.storage_conditions)'] || row.storageConditions || row['Storage Conditions'] || ''),
        volume: fixEncodingIssues(row['Volume (product.metafields.custom.volume)'] || row.volume || row.Volume || ''),
        matrix: fixEncodingIssues(row['Matrix (product.metafields.custom.matrix)'] || row.matrix || row.Matrix || ''),
        casNumber: fixEncodingIssues(row['CAS Number (product.metafields.custom.cas_number)'] || row.casNumber || row['CAS Number'] || row.cas_number || ''),
        catalogNumber: fixEncodingIssues(row['Catalog Number (product.metafields.custom.catalog_number)'] || row.catalogNumber || row['Catalog Number'] || row.catalog_number || ''),
        dotHazardous: fixEncodingIssues(row['DOT Hazardous (product.metafields.custom.dot_hazardous)'] || row.dotHazardous || row['DOT Hazardous'] || row.dot_hazardous || ''),
        expirationMonths: row['expiration months (product.metafields.custom.expiration_months)'] || row.expirationMonths || row['expiration months'] || ''
      };

      validatedRows.push(validatedRow);
    }
  });

  if (errors.length > 0) {
    throw new Error(`CSV validation failed:\n${errors.join('\n')}`);
  }

  return { data: validatedRows, format: 'products' };
}

/**
 * Validate metafields CSV data
 */
export function validateMetafieldCSVData(data) {
  const requiredFields = ['handle', 'namespace', 'key', 'value'];
  const validTypes = [
    'single_line_text_field',
    'multi_line_text_field',
    'number_integer',
    'number_decimal',
    'date',
    'date_time',
    'boolean',
    'color',
    'weight',
    'volume',
    'dimension',
    'rating',
    'json',
    'money',
    'file_reference',
    'page_reference',
    'product_reference',
    'variant_reference',
    'collection_reference',
    'url'
  ];

  const validatedRows = [];
  const errors = [];

  data.forEach((row, index) => {
    const rowErrors = [];

    // Check required fields
    requiredFields.forEach(field => {
      if (!row[field] || row[field].trim() === '') {
        rowErrors.push(`Row ${index + 1}: Missing required field '${field}'`);
      }
    });

    // Validate handle format (should be URL-friendly)
    if (row.handle && !/^[a-z0-9_.\-()&]+$/.test(row.handle.trim())) {
      rowErrors.push(`Row ${index + 1}: Invalid handle format. Handle contains unsupported characters.`);
    }

    // Validate metafield type
    const type = row.type ? row.type.trim() : 'single_line_text_field';
    if (!validTypes.includes(type)) {
      rowErrors.push(`Row ${index + 1}: Invalid metafield type '${type}'. Valid types: ${validTypes.join(', ')}`);
    }

    // Validate namespace and key format
    if (row.namespace && !/^[a-zA-Z0-9_-]+$/.test(row.namespace.trim())) {
      rowErrors.push(`Row ${index + 1}: Invalid namespace format. Use letters, numbers, underscores, and hyphens only.`);
    }

    if (row.key && !/^[a-zA-Z0-9_-]+$/.test(row.key.trim())) {
      rowErrors.push(`Row ${index + 1}: Invalid key format. Use letters, numbers, underscores, and hyphens only.`);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      validatedRows.push({
        handle: row.handle.trim(),
        namespace: row.namespace.trim(),
        key: row.key.trim(),
        value: fixEncodingIssues(row.value.trim()),
        type: type
      });
    }
  });

  if (errors.length > 0) {
    throw new Error(`CSV validation failed:\n${errors.join('\n')}`);
  }

  return { data: validatedRows, format: 'metafields' };
}

/**
 * Group data by product handle for batch processing
 */
export function groupDataByHandle(data, format) {
  if (format === 'metafields') {
    return groupMetafieldsByHandle(data);
  } else if (format === 'products') {
    return groupProductsByHandle(data);
  }
  throw new Error('Unknown format for grouping');
}

/**
 * Group metafields by product handle for batch processing
 */
export function groupMetafieldsByHandle(metafields) {
  const grouped = {};

  metafields.forEach(metafield => {
    if (!grouped[metafield.handle]) {
      grouped[metafield.handle] = [];
    }
    grouped[metafield.handle].push({
      namespace: metafield.namespace,
      key: metafield.key,
      value: metafield.value,
      type: metafield.type
    });
  });

  return grouped;
}

/**
 * Group products by handle for batch processing
 */
export function groupProductsByHandle(products) {
  const grouped = {};

  products.forEach(product => {
    grouped[product.handle] = product;
  });

  return grouped;
}

/**
 * Create batches for processing to respect API rate limits
 * Default batch size is conservative to avoid rate limits
 */
export function createBatches(items, batchSize = 5) {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Enhanced rate limiting configuration
 */
export const RATE_LIMIT_CONFIG = {
  // Shopify Admin API rate limits (as of 2024)
  GRAPHQL_COST_LIMIT: 1000,        // Points per 10 seconds
  BATCH_SIZE: 5,                   // Conservative batch size
  INTER_BATCH_DELAY: 50,           // Ultra-minimal delay for fastest processing
  RETRY_DELAY: 1000,               // Milliseconds to wait on rate limit
  MAX_RETRIES: 3,                  // Maximum retry attempts

  // Adaptive batching thresholds
  SMALL_DATASET: 10,               // < 10 items: batch size 3
  MEDIUM_DATASET: 50,              // 10-50 items: batch size 5
  LARGE_DATASET: 100,              // 50-100 items: batch size 4
  // > 100 items: batch size 3
};

/**
 * Get optimal batch size based on dataset size
 */
export function getOptimalBatchSize(totalItems) {
  // Balanced batch sizes - faster processing while maintaining stability
  if (totalItems < RATE_LIMIT_CONFIG.SMALL_DATASET) {
    return 3; // Small batches for small datasets
  } else if (totalItems < RATE_LIMIT_CONFIG.MEDIUM_DATASET) {
    return 2; // Medium batches for medium datasets
  } else if (totalItems < RATE_LIMIT_CONFIG.LARGE_DATASET) {
    return 2; // Medium batches for large datasets
  } else {
    return 1; // Single item processing only for very large datasets (>500)
  }
}

/**
 * Calculate delay based on batch size and position
 */
export function calculateDelay(batchIndex, totalBatches, batchSize) {
  // Use fixed minimal delay for fastest processing
  return RATE_LIMIT_CONFIG.INTER_BATCH_DELAY;
}

/**
 * Validate metafield value based on type
 */
export function validateMetafieldValue(value, type) {
  switch (type) {
    case 'number_integer':
      return /^-?\d+$/.test(value);
    case 'number_decimal':
      return /^-?\d*\.?\d+$/.test(value);
    case 'boolean':
      return ['true', 'false', '1', '0'].includes(value.toLowerCase());
    case 'date':
      return !isNaN(Date.parse(value));
    case 'date_time':
      return !isNaN(Date.parse(value));
    case 'color':
      return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);
    case 'url':
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    case 'json':
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    default:
      return true; // For text fields and other types, any value is valid
  }
}

/**
 * Fix common encoding issues in text, particularly μg symbols
 */
export function fixEncodingIssues(text) {
  if (!text || typeof text !== 'string') return text;

  return text
    // Fix corrupted microgram symbol - both variants
    .replace(/\?g/g, 'μg')     // Question mark variant (in concentration fields)
    .replace(/�g/g, 'μg')      // Replacement character variant (in title/description fields)
    // Fix other common encoding issues
    .replace(/Â/g, '')  // Remove stray Â characters
    .replace(/â€™/g, "'")  // Fix apostrophes
    .replace(/â€œ/g, '"')  // Fix opening quotes
    .replace(/â€/g, '"')   // Fix closing quotes
    .replace(/â€"/g, '–')  // Fix en-dash
    .replace(/â€"/g, '—'); // Fix em-dash
}

/**
 * Format metafield value based on type
 */
export function formatMetafieldValue(value, type) {
  // First fix any encoding issues
  const cleanValue = fixEncodingIssues(value);

  switch (type) {
    case 'boolean':
      return ['true', '1'].includes(cleanValue.toLowerCase()) ? 'true' : 'false';
    case 'json':
      // Ensure valid JSON formatting
      return JSON.stringify(JSON.parse(cleanValue));
    case 'number_integer':
      return parseInt(cleanValue, 10).toString();
    case 'number_decimal':
      return parseFloat(cleanValue).toString();
    case 'url':
      // Ensure URL is properly formatted
      if (!cleanValue.startsWith('http://') && !cleanValue.startsWith('https://')) {
        return `https://${cleanValue}`;
      }
      return cleanValue;
    default:
      return cleanValue;
  }
}

/**
 * Get supported metafield definitions for product properties
 */
export function getSupportedMetafields() {
  return {
    components: {
      key: 'components',
      namespace: 'custom',
      type: 'json',
      description: 'Product components in JSON format'
    },
    shipping_info: {
      key: 'shipping_info',
      namespace: 'custom',
      type: 'single_line_text_field',
      description: 'Shipping information'
    },
    unit_packs: {
      key: 'unit_packs',
      namespace: 'custom',
      type: 'single_line_text_field',
      description: 'Unit/Packs information'
    },
    coa: {
      key: 'coa',
      namespace: 'custom',
      type: 'url', // Can be url or single_line_text_field
      description: 'Certificate of Analysis (COA) URL or reference'
    },
    sds: {
      key: 'sds',
      namespace: 'custom',
      type: 'url', // Can be url or single_line_text_field
      description: 'Safety Data Sheet (SDS) URL or reference'
    },
    storage_conditions: {
      key: 'storage_conditions',
      namespace: 'custom',
      type: 'single_line_text_field',
      description: 'Storage conditions'
    },
    volume: {
      key: 'volume',
      namespace: 'custom',
      type: 'single_line_text_field',
      description: 'Product volume'
    },
    expiration_months: {
      key: 'expiration_months',
      namespace: 'custom',
      type: 'number_integer',
      description: 'Expiration period in months'
    }
  };
}
