import { jobQueue } from './jobQueue';
import { 
  parseCSV, 
  groupDataByHandle, 
  getOptimalBatchSize, 
  createBatches, 
  calculateDelay,
  RATE_LIMIT_CONFIG 
} from './csvProcessor';
import { GET_PRODUCT_BY_HANDLE, SET_METAFIELDS, UPDATE_PRODUCT_PROPERTIES } from '../graphql/metafields';

// Background CSV processor
export async function processCSVInBackground(admin, file, dryRun, jobId) {
  try {
    console.log(`Starting background processing for job ${jobId}`);
    jobQueue.startJob(jobId);

    // Parse CSV file
    const csvData = await parseCSV(file, { preview: false });
    
    if (csvData.errors.length > 0) {
      jobQueue.failJob(jobId, new Error(`CSV parsing errors: ${csvData.errors.join(', ')}`));
      return;
    }

    const { data, format } = csvData.data;
    const groupedData = groupDataByHandle(data, format);
    const handles = Object.keys(groupedData);

    // Update job with total count
    jobQueue.updateProgress(jobId, {
      total: handles.length,
      format
    });

    const results = {
      processed: 0,
      errors: [],
      success: [],
      total: handles.length,
      format
    };

    // Process in batches
    const optimalBatchSize = getOptimalBatchSize(handles.length);
    const batches = createBatches(handles, optimalBatchSize);

    console.log(`Job ${jobId}: Processing ${handles.length} products in ${batches.length} batches of size ${optimalBatchSize}`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchPromises = batch.map(async (handle) => {
        try {
          // Get product by handle
          const productResponse = await admin.graphql(GET_PRODUCT_BY_HANDLE, {
            variables: { handle },
            tries: RATE_LIMIT_CONFIG.MAX_RETRIES
          });

          const productData = await productResponse.json();

          if (!productData.data.productByHandle) {
            results.errors.push({
              handle,
              error: `Product with handle '${handle}' not found`
            });
            return;
          }

          const product = productData.data.productByHandle;

          if (format === 'metafields') {
            await processMetafields(admin, product, groupedData[handle], results, handle, dryRun);
          } else if (format === 'products') {
            await processProductProperties(admin, product, groupedData[handle], results, handle, dryRun);
          }

          results.processed++;

        } catch (error) {
          results.errors.push({
            handle,
            error: `Processing error: ${error.message}`
          });
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Update progress
      const progressPercent = Math.round(((batchIndex + 1) / batches.length) * 100);
      jobQueue.updateProgress(jobId, {
        progress: progressPercent,
        processed: results.processed,
        errors: results.errors,
        success: results.success
      });

      console.log(`Job ${jobId}: Batch ${batchIndex + 1}/${batches.length} complete (${progressPercent}%). Processed: ${results.processed}, Errors: ${results.errors.length}`);

      // Add delay between batches
      if (batchIndex < batches.length - 1) {
        const delay = calculateDelay(batchIndex, batches.length, optimalBatchSize);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Complete the job
    jobQueue.completeJob(jobId, {
      results,
      dryRun
    });

    console.log(`Job ${jobId} completed successfully. Processed: ${results.processed}, Errors: ${results.errors.length}`);

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    jobQueue.failJob(jobId, error);
  }
}

// Helper functions (simplified versions of the ones in the main API)
async function processMetafields(admin, product, metafieldsToSet, results, handle, dryRun) {
  // Simplified metafields processing
  if (!dryRun && metafieldsToSet.length > 0) {
    const metafieldsResponse = await admin.graphql(SET_METAFIELDS, {
      variables: { metafields: metafieldsToSet },
      tries: RATE_LIMIT_CONFIG.MAX_RETRIES
    });

    const metafieldsData = await metafieldsResponse.json();

    if (metafieldsData.data.metafieldsSet.userErrors.length > 0) {
      results.errors.push({
        handle,
        error: `Metafield update errors: ${metafieldsData.data.metafieldsSet.userErrors.map(e => e.message).join(', ')}`
      });
    } else {
      results.success.push({
        handle,
        metafieldsUpdated: metafieldsToSet.length,
        productTitle: product.title
      });
    }
  }
}

async function processProductProperties(admin, product, productData, results, handle, dryRun) {
  // Full product properties processing (matching main processor)
  const updateInput = { id: product.id };

  // Build basic update input
  if (productData.title) updateInput.title = productData.title;
  if (productData.bodyHtml) updateInput.descriptionHtml = productData.title;
  if (productData.vendor) updateInput.vendor = productData.vendor;
  if (productData.productType) updateInput.productType = productData.productType;
  if (productData.published !== undefined) {
    updateInput.status = productData.published ? 'ACTIVE' : 'DRAFT';
  }

  // Handle tags (preserve existing + add CSV + add import tag)
  let tagsArray = [];
  if (product.tags && product.tags.length > 0) {
    tagsArray = [...product.tags];
  }
  if (productData.tags) {
    const csvTags = productData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    csvTags.forEach(tag => {
      if (!tagsArray.includes(tag)) {
        tagsArray.push(tag);
      }
    });
  }
  const csvImportTag = 'product_csv_import';
  if (!tagsArray.includes(csvImportTag)) {
    tagsArray.push(csvImportTag);
  }
  updateInput.tags = tagsArray;

  // Handle all metafields (matching main processor)
  const metafields = [];

  // Components metafield (with proper JSON parsing logic)
  if (productData.components) {
    // Parse components value - if it's semicolon-separated, convert to JSON array
    let componentsValue;
    if (productData.components.includes(';')) {
      // Convert semicolon-separated values to JSON array
      const componentsArray = productData.components.split(';').map(c => c.trim()).filter(c => c);
      componentsValue = JSON.stringify(componentsArray);
    } else {
      // Single component or already JSON
      try {
        // Try to parse as JSON first
        JSON.parse(productData.components);
        componentsValue = productData.components;
      } catch {
        // If not valid JSON, wrap in array
        componentsValue = JSON.stringify([productData.components.trim()]);
      }
    }

    metafields.push({
      namespace: 'custom',
      key: 'components',
      value: componentsValue,
      type: 'json'
    });
  }

  // Shipping Info metafield
  if (productData.shippingInfo) {
    metafields.push({
      namespace: 'custom',
      key: 'shipping_info',
      value: productData.shippingInfo,
      type: 'single_line_text_field'
    });
  }

  // Unit/Packs metafield
  if (productData.unitPacks) {
    metafields.push({
      namespace: 'custom',
      key: 'unit_packs',
      value: productData.unitPacks,
      type: 'single_line_text_field'
    });
  }

  // COA metafield (Certificate of Analysis - likely a URL)
  if (productData.coa) {
    // Validate if it's a URL, otherwise treat as text
    const isUrl = productData.coa.startsWith('http://') || productData.coa.startsWith('https://');
    metafields.push({
      namespace: 'custom',
      key: 'coa',
      value: productData.coa,
      type: isUrl ? 'url' : 'single_line_text_field'
    });
  }

  // SDS metafield (Safety Data Sheet - likely a URL)
  if (productData.sds) {
    // Validate if it's a URL, otherwise treat as text
    const isUrl = productData.sds.startsWith('http://') || productData.sds.startsWith('https://');
    metafields.push({
      namespace: 'custom',
      key: 'sds',
      value: productData.sds,
      type: isUrl ? 'url' : 'single_line_text_field'
    });
  }

  // Storage Conditions metafield
  if (productData.storageConditions) {
    metafields.push({
      namespace: 'custom',
      key: 'storage_conditions',
      value: productData.storageConditions,
      type: 'single_line_text_field'
    });
  }

  // Volume metafield
  if (productData.volume) {
    metafields.push({
      namespace: 'custom',
      key: 'volume',
      value: productData.volume,
      type: 'single_line_text_field'
    });
  }

  // Matrix metafield
  if (productData.matrix) {
    metafields.push({
      namespace: 'custom',
      key: 'matrix',
      value: productData.matrix,
      type: 'single_line_text_field'
    });
  }

  // CAS Number metafield
  if (productData.casNumber) {
    metafields.push({
      namespace: 'custom',
      key: 'cas_number',
      value: productData.casNumber,
      type: 'single_line_text_field'
    });
  }

  // Catalog Number metafield
  if (productData.catalogNumber) {
    metafields.push({
      namespace: 'custom',
      key: 'catalog_number',
      value: productData.catalogNumber,
      type: 'single_line_text_field'
    });
  }

  // DOT Hazardous metafield
  if (productData.dotHazardous) {
    metafields.push({
      namespace: 'custom',
      key: 'dot_hazardous',
      value: productData.dotHazardous,
      type: 'single_line_text_field'
    });
  }

  // Expiration Months metafield
  if (productData.expirationMonths) {
    metafields.push({
      namespace: 'custom',
      key: 'expiration_months',
      value: productData.expirationMonths.toString(),
      type: 'number_integer'
    });
  }

  if (metafields.length > 0) {
    updateInput.metafields = metafields;
  }

  if (!dryRun) {
    const productResponse = await admin.graphql(UPDATE_PRODUCT_PROPERTIES, {
      variables: { input: updateInput },
      tries: RATE_LIMIT_CONFIG.MAX_RETRIES
    });

    const productUpdateData = await productResponse.json();

    if (productUpdateData.data.productUpdate.userErrors.length > 0) {
      results.errors.push({
        handle,
        error: `Product update errors: ${productUpdateData.data.productUpdate.userErrors.map(e => e.message).join(', ')}`
      });
    } else {
      results.success.push({
        handle,
        productTitle: productUpdateData.data.productUpdate.product.title,
        updated: true
      });
    }
  }
}
