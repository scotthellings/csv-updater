import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  parseCSV,
  groupDataByHandle,
  createBatches,
  validateMetafieldValue,
  formatMetafieldValue,
  getOptimalBatchSize,
  calculateDelay,
  RATE_LIMIT_CONFIG
} from "../utils/csvProcessor";
import { GET_PRODUCT_BY_HANDLE, SET_METAFIELDS, UPDATE_PRODUCT_PROPERTIES } from "../graphql/metafields";
import { jobQueue } from "../utils/jobQueue";
import { processCSVInBackground } from "../utils/csvBackgroundProcessor";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const dryRun = formData.get("dryRun") === "true";

    if (!file) {
      return json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`Starting CSV processing - Dry run: ${dryRun}, File size: ${file.size} bytes`);

    // Parse CSV file with preview option
    const csvData = await parseCSV(file, { preview: dryRun });

    if (csvData.errors.length > 0) {
      return json({
        error: "CSV parsing errors",
        details: csvData.errors
      }, { status: 400 });
    }

    const { data, format } = csvData.data;

    // Group data by product handle
    const groupedData = groupDataByHandle(data, format);
    const handles = Object.keys(groupedData);

    console.log(`Found ${handles.length} unique product handles to process`);

    if (handles.length === 0) {
      return json({
        error: "No valid product handles found in CSV",
        results: { processed: 0, errors: [], success: [] }
      }, { status: 400 });
    }

    // For large datasets in production mode, use background processing
    if (!dryRun && handles.length > 50) {
      console.log(`Large dataset detected (${handles.length} products). Starting background processing...`);

      // Create background job
      const jobId = jobQueue.createJob('csv-processing', {
        fileContent: await file.text(), // Store file content
        dryRun,
        format,
        totalProducts: handles.length
      });

      // Start background processing (don't await)
      processCSVInBackground(admin, file, dryRun, jobId).catch(error => {
        console.error(`Background job ${jobId} failed:`, error);
        jobQueue.failJob(jobId, error);
      });

      return json({
        success: true,
        backgroundProcessing: true,
        jobId,
        message: `Processing ${handles.length} products in background. Use job ID ${jobId} to check status.`,
        totalProducts: handles.length,
        estimatedTime: `${Math.ceil(handles.length / 10)} minutes`
      });
    }

    // Validate products exist and prepare updates
    const results = {
      processed: 0,
      errors: [],
      success: [],
      total: handles.length,
      format
    };

    // Process in batches to respect rate limits with adaptive sizing
    const optimalBatchSize = getOptimalBatchSize(handles.length);
    const batches = createBatches(handles, optimalBatchSize);

    console.log(`Processing ${handles.length} products in ${batches.length} batches of size ${optimalBatchSize}`);

    // For very large datasets in production mode, warn about processing time
    if (!dryRun && handles.length > 100) {
      console.log(`WARNING: Processing ${handles.length} products may take 15-30 minutes. Using ultra-conservative batch sizes to prevent timeouts.`);
    }

    // Add overall timeout to prevent hanging - aggressive timeout for faster processing
    const processingTimeout = setTimeout(() => {
      console.error('Processing timeout reached - this may indicate a hanging process');
    }, 5 * 60 * 1000); // 5 minutes timeout for faster failure detection

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchPromises = batch.map(async (handle) => {
        try {
          // Get product by handle with retry logic
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
          // Enhanced error handling for rate limits
          if (error.message.includes('429') || error.message.includes('rate limit')) {
            console.log(`Rate limit hit for handle ${handle}, will retry...`);
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.RETRY_DELAY));
          }

          results.errors.push({
            handle,
            error: `Processing error: ${error.message}`
          });
        }
      });

      // Wait for batch to complete with error handling
      try {
        await Promise.all(batchPromises);
        const progressPercent = Math.round(((batchIndex + 1) / batches.length) * 100);
        console.log(`Batch ${batchIndex + 1}/${batches.length} complete (${progressPercent}%). Processed: ${results.processed}, Errors: ${results.errors.length}`);
      } catch (batchError) {
        console.error(`Batch ${batchIndex + 1} failed:`, batchError);
        results.errors.push({
          handle: 'batch_error',
          error: `Batch ${batchIndex + 1} processing failed: ${batchError.message}`
        });
      }

      // Add adaptive delay between batches (but not after the last batch)
      if (batchIndex < batches.length - 1) {
        const delay = calculateDelay(batchIndex, batches.length, optimalBatchSize);
        console.log(`Waiting ${delay}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.log(`All ${batches.length} batches completed. Final results: Processed: ${results.processed}, Errors: ${results.errors.length}`);
      }

      // Force garbage collection between batches to prevent memory buildup
      if (global.gc && batchIndex % 10 === 0) {
        try {
          global.gc();
          console.log(`Garbage collection triggered after batch ${batchIndex + 1}`);
        } catch (gcError) {
          // Ignore GC errors
        }
      }
    }

    // Clear the timeout
    clearTimeout(processingTimeout);

    console.log(`CSV processing completed successfully. Processed: ${results.processed}, Errors: ${results.errors.length}`);

    // Return response immediately to prevent timeout
    return json({
      success: true,
      results,
      dryRun
    });

  } catch (error) {
    console.error("CSV processing error:", error);
    console.error("Error stack:", error.stack);
    return json({
      error: "Failed to process CSV",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
};

// Helper function to process metafields
async function processMetafields(admin, product, metafieldsToSet, results, handle, dryRun) {
  const validationErrors = [];
  const validMetafields = [];

  metafieldsToSet.forEach((metafield) => {
    if (!validateMetafieldValue(metafield.value, metafield.type)) {
      validationErrors.push(`Invalid value '${metafield.value}' for type '${metafield.type}'`);
    } else {
      validMetafields.push({
        ownerId: product.id,
        namespace: metafield.namespace,
        key: metafield.key,
        value: formatMetafieldValue(metafield.value, metafield.type),
        type: metafield.type
      });
    }
  });

  if (validationErrors.length > 0) {
    results.errors.push({
      handle,
      error: `Validation errors: ${validationErrors.join(', ')}`
    });
    return;
  }

  if (!dryRun && validMetafields.length > 0) {
    // Set metafields with retry logic
    const metafieldsResponse = await admin.graphql(SET_METAFIELDS, {
      variables: { metafields: validMetafields },
      tries: RATE_LIMIT_CONFIG.MAX_RETRIES
    });

    const metafieldsData = await metafieldsResponse.json();

    if (metafieldsData.data.metafieldsSet.userErrors.length > 0) {
      results.errors.push({
        handle,
        error: `Metafield update errors: ${metafieldsData.data.metafieldsSet.userErrors.map(e => e.message).join(', ')}`
      });
    } else {
      // Metafields updated successfully, now add the product_csv_import tag
      // This preserves all existing product tags
      try {
        // Get current product tags (tags come as an array from GraphQL)
        const currentTags = product.tags || [];
        const csvImportTag = 'product_csv_import';

        // Add the tag if it's not already present (preserves existing tags)
        if (!currentTags.includes(csvImportTag)) {
          const updatedTags = [...currentTags, csvImportTag];

          // Update product with the new tag
          const productUpdateResponse = await admin.graphql(UPDATE_PRODUCT_PROPERTIES, {
            variables: {
              input: {
                id: product.id,
                tags: updatedTags
              }
            },
            tries: RATE_LIMIT_CONFIG.MAX_RETRIES
          });

          const productUpdateData = await productUpdateResponse.json();

          if (productUpdateData.data.productUpdate.userErrors.length > 0) {
            console.warn(`Warning: Could not add tag to product ${handle}: ${productUpdateData.data.productUpdate.userErrors.map(e => e.message).join(', ')}`);
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not add tag to product ${handle}: ${error.message}`);
      }

      results.success.push({
        handle,
        metafieldsUpdated: validMetafields.length,
        productTitle: product.title
      });
    }
  } else {
    // Dry run - just validate
    results.success.push({
      handle,
      metafieldsToUpdate: validMetafields.length,
      productTitle: product.title,
      dryRun: true
    });
  }
}

// Helper function to process product properties
async function processProductProperties(admin, product, productData, results, handle, dryRun) {
  const updateInput = {
    id: product.id
  };

  // Build update input
  if (productData.title) updateInput.title = productData.title;
  if (productData.bodyHtml) updateInput.descriptionHtml = productData.bodyHtml;
  if (productData.vendor) updateInput.vendor = productData.vendor;
  if (productData.productType) updateInput.productType = productData.productType;
  // Handle tags - merge CSV tags with existing tags and add "product_csv_import" tag
  // This preserves all existing product tags and adds new ones from CSV
  let tagsArray = [];

  // Start with existing product tags to preserve them
  if (product.tags && product.tags.length > 0) {
    tagsArray = [...product.tags];
  }

  // Add CSV tags if provided (and not already present)
  if (productData.tags) {
    const csvTags = productData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    csvTags.forEach(tag => {
      if (!tagsArray.includes(tag)) {
        tagsArray.push(tag);
      }
    });
  }

  // Add the product_csv_import tag if it's not already present
  const csvImportTag = 'product_csv_import';
  if (!tagsArray.includes(csvImportTag)) {
    tagsArray.push(csvImportTag);
  }

  updateInput.tags = tagsArray;

  if (productData.published !== undefined) {
    updateInput.status = productData.published ? 'ACTIVE' : 'DRAFT';
  }

  // Handle all metafields
  const metafields = [];

  // Components metafield (existing logic)
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
    // Update product with retry logic
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
        fieldsUpdated: Object.keys(updateInput).length - 1, // -1 for id
        productTitle: productUpdateData.data.productUpdate.product.title
      });
    }
  } else {
    // Dry run - just validate
    results.success.push({
      handle,
      fieldsToUpdate: Object.keys(updateInput).length - 1, // -1 for id
      productTitle: product.title,
      dryRun: true
    });
  }
}

export const loader = async () => {
  return json({ error: "Method not allowed" }, { status: 405 });
};
