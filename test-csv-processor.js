// Simple test script for CSV processor functions
import { validateCSVData, groupDataByHandle, validateMetafieldValue, formatMetafieldValue, detectCSVFormat } from './app/utils/csvProcessor.js';

// Test data for metafields
const metafieldTestData = [
  {
    handle: 'red-snowboard',
    namespace: 'custom',
    key: 'color',
    value: 'red',
    type: 'single_line_text_field'
  },
  {
    handle: 'red-snowboard',
    namespace: 'custom',
    key: 'weight',
    value: '5.2',
    type: 'number_decimal'
  },
  {
    handle: 'blue-snowboard',
    namespace: 'custom',
    key: 'eco_friendly',
    value: 'true',
    type: 'boolean'
  }
];

// Test data for product properties
const productTestData = [
  {
    Handle: 'red-snowboard',
    Title: 'Red Snowboard',
    'Body (HTML)': '<p>A red snowboard</p>',
    Vendor: 'Acme',
    Type: 'Snowboard',
    Tags: 'winter,sports',
    Published: 'true',
    'Components (product.metafields.custom.components)': 'comp1,comp2'
  },
  {
    Handle: 'blue-snowboard',
    Title: 'Blue Snowboard',
    Vendor: 'Acme',
    Published: 'false'
  }
];

console.log('Testing CSV format detection...');

// Test format detection
console.log('Metafields format:', detectCSVFormat(metafieldTestData));
console.log('Products format:', detectCSVFormat(productTestData));

console.log('\nTesting metafields CSV validation...');

try {
  const validatedData = validateCSVData(metafieldTestData);
  console.log('✅ Metafields validation passed');
  console.log('Format:', validatedData.format);
  console.log('Valid rows:', validatedData.data.length);

  // Test grouping
  const grouped = groupDataByHandle(validatedData.data, validatedData.format);
  console.log('✅ Metafields grouping test passed');
  console.log('Groups:', Object.keys(grouped));
  console.log('Red snowboard metafields:', grouped['red-snowboard'].length);

} catch (error) {
  console.log('❌ Unexpected error:', error.message);
}

console.log('\nTesting products CSV validation...');

try {
  const validatedData = validateCSVData(productTestData);
  console.log('✅ Products validation passed');
  console.log('Format:', validatedData.format);
  console.log('Valid rows:', validatedData.data.length);

  // Test grouping
  const grouped = groupDataByHandle(validatedData.data, validatedData.format);
  console.log('✅ Products grouping test passed');
  console.log('Groups:', Object.keys(grouped));
  console.log('Red snowboard data:', grouped['red-snowboard']);

} catch (error) {
  console.log('❌ Unexpected error:', error.message);
}

// Test value validation
console.log('\nTesting value validation...');
console.log('Integer "123":', validateMetafieldValue('123', 'number_integer'));
console.log('Integer "12.3":', validateMetafieldValue('12.3', 'number_integer'));
console.log('Decimal "12.3":', validateMetafieldValue('12.3', 'number_decimal'));
console.log('Boolean "true":', validateMetafieldValue('true', 'boolean'));
console.log('Boolean "yes":', validateMetafieldValue('yes', 'boolean'));
console.log('Color "#FF0000":', validateMetafieldValue('#FF0000', 'color'));
console.log('Color "red":', validateMetafieldValue('red', 'color'));

// Test value formatting
console.log('\nTesting value formatting...');
console.log('Boolean "1":', formatMetafieldValue('1', 'boolean'));
console.log('Boolean "false":', formatMetafieldValue('false', 'boolean'));
console.log('JSON object:', formatMetafieldValue('{"test": "value"}', 'json'));

console.log('\n✅ All tests completed!');
