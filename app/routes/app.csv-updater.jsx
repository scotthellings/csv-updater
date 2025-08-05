import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  ProgressBar,
  Banner,
  List,
  InlineStack,
  Box,
  DropZone,
  Thumbnail,
  Badge,
  DataTable,
  Divider
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function CSVUpdater() {
  const fetcher = useFetcher();
  const [file, setFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [currentOperation, setCurrentOperation] = useState(null); // 'preview' or 'apply'
  const [backgroundJob, setBackgroundJob] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  const isProcessing = fetcher.state === "submitting";
  const results = fetcher.data?.results;

  // Handle background job response
  useEffect(() => {
    if (fetcher.data?.backgroundProcessing && fetcher.data?.jobId) {
      setBackgroundJob(fetcher.data);
      setJobStatus({ status: 'processing', progress: 0 });
    }
  }, [fetcher.data]);

  // Poll job status for background processing - temporarily disabled due to route issues
  // The background processing is working perfectly, just the status polling route needs fixing
  /*
  useEffect(() => {
    if (!backgroundJob?.jobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/app/api/job-status?jobId=${backgroundJob.jobId}`);
        const status = await response.json();

        setJobStatus(status);

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(pollInterval);
          setBackgroundJob(null);
        }
      } catch (error) {
        console.error('Failed to poll job status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [backgroundJob?.jobId]);
  */

  const handleDropZoneDrop = useCallback((files) => {
    const uploadedFile = files[0];

    if (uploadedFile) {
      if (uploadedFile.type !== 'text/csv' && !uploadedFile.name.endsWith('.csv')) {
        setUploadError('Please upload a CSV file');
        return;
      }

      if (uploadedFile.size > 5 * 1024 * 1024) { // 5MB limit
        setUploadError('File size must be less than 5MB');
        return;
      }

      setFile(uploadedFile);
      setUploadError(null);
    }
  }, []);

  const handleFileRemove = useCallback(() => {
    setFile(null);
    setUploadError(null);
  }, []);

  const handleProcessCSV = (dryRunMode) => {
    if (!file) return;

    setCurrentOperation(dryRunMode ? 'preview' : 'apply');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('dryRun', dryRunMode.toString());

    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/process-csv',
      encType: 'multipart/form-data'
    });
  };

  const fileUpload = !file && (
    <DropZone onDrop={handleDropZoneDrop}>
      <DropZone.FileUpload />
    </DropZone>
  );

  const uploadedFile = file && (
    <InlineStack align="space-between">
      <InlineStack gap="400">
        <Thumbnail
          size="small"
          alt="CSV file"
          source="data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 15.414 5L12 1.586A2 2 0 0 0 10.586 1H6z' fill='%23637381'/%3e%3c/svg%3e"
        />
        <div>
          <Text variant="bodyMd" fontWeight="bold">
            {file.name}
          </Text>
          <Text variant="bodySm" color="subdued">
            {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Size unknown'}
          </Text>
        </div>
      </InlineStack>
      <Button onClick={handleFileRemove}>Remove</Button>
    </InlineStack>
  );

  const progressSection = isProcessing && (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">
          Processing CSV...
        </Text>
        <ProgressBar progress={results?.processed || 0} size="small" />
        <Text variant="bodyMd">
          {results?.processed || 0} of {results?.total || 0} products processed
        </Text>
      </BlockStack>
    </Card>
  );

  const resultsSection = results && !isProcessing && (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">
          {fetcher.data?.dryRun ? 'Preview Results' : 'Processing Results'}
        </Text>

        <InlineStack gap="400">
          <Badge status="success">
            {results.success.length} successful
          </Badge>
          {results.errors.length > 0 && (
            <Badge status="critical">
              {results.errors.length} errors
            </Badge>
          )}
        </InlineStack>

        {results.success.length > 0 && (
          <Box>
            <Text as="h4" variant="headingSm">Successful Updates</Text>
            <DataTable
              columnContentTypes={['text', 'text', 'numeric']}
              headings={[
                'Product Handle',
                'Product Title',
                results.format === 'metafields'
                  ? (fetcher.data?.dryRun ? 'Metafields to Update' : 'Metafields Updated')
                  : (fetcher.data?.dryRun ? 'Fields to Update' : 'Fields Updated')
              ]}
              rows={results.success.map(item => [
                item.handle,
                item.productTitle,
                item.metafieldsUpdated || item.metafieldsToUpdate || item.fieldsUpdated || item.fieldsToUpdate || 0
              ])}
            />
          </Box>
        )}

        {results.errors.length > 0 && (
          <Box>
            <Text as="h4" variant="headingSm">Errors</Text>
            <List type="bullet">
              {results.errors.map((error, index) => (
                <List.Item key={index}>
                  <strong>{error.handle}:</strong> {error.error}
                </List.Item>
              ))}
            </List>
          </Box>
        )}
      </BlockStack>
    </Card>
  );

  const errorSection = fetcher.data?.error && (
    <Banner status="critical">
      <p>{fetcher.data.error}</p>
      {fetcher.data.details && (
        <List type="bullet">
          {Array.isArray(fetcher.data.details)
            ? fetcher.data.details.map((detail, index) => (
                <List.Item key={index}>{detail}</List.Item>
              ))
            : <List.Item>{fetcher.data.details}</List.Item>
          }
        </List>
      )}
    </Banner>
  );

  return (
    <Page>
      <TitleBar title="CSV Metafield Updater" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {errorSection}

            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">
                  Upload CSV File
                </Text>
                <Text variant="bodyMd">
                  Upload a CSV file to update product properties or metafields. The app supports two formats:
                </Text>
                <List type="bullet">
                  <List.Item><strong>Product Properties:</strong> Handle, Title, Body (HTML), Vendor, Type, Tags, Published, Components</List.Item>
                  <List.Item><strong>Metafields:</strong> handle, namespace, key, value, type</List.Item>
                </List>

                <Box>
                  {fileUpload}
                  {uploadedFile}
                  {uploadError && (
                    <Banner status="critical">
                      {uploadError}
                    </Banner>
                  )}
                </Box>

                {file && (
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd" color="subdued">
                      Preview shows first 25 rows for performance. All rows will be processed when applying changes.
                    </Text>
                    <InlineStack gap="400" align="start">
                      <Button
                        onClick={() => handleProcessCSV(true)}
                        loading={isProcessing && currentOperation === 'preview'}
                        disabled={!file || isProcessing}
                      >
                        Preview Changes
                      </Button>
                      <Button
                        primary
                        onClick={() => handleProcessCSV(false)}
                        loading={isProcessing && currentOperation === 'apply'}
                        disabled={!file || isProcessing}
                      >
                        Apply Changes
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}

                {/* Background Processing Status */}
                {backgroundJob && (
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingMd">Processing in Background</Text>
                      <Text>
                        Processing {backgroundJob.totalProducts} products. This may take {backgroundJob.estimatedTime}.
                      </Text>

                      {jobStatus && (
                        <BlockStack gap="300">
                          {jobStatus.status === 'processing' && (
                            <>
                              <ProgressBar
                                progress={jobStatus.progress || 0}
                                size="large"
                              />
                              <Text variant="bodySm">
                                {jobStatus.processed || 0} of {jobStatus.total || backgroundJob.totalProducts} products processed
                                {jobStatus.errors && jobStatus.errors.length > 0 && ` (${jobStatus.errors.length} errors)`}
                              </Text>
                            </>
                          )}

                          {jobStatus.status === 'completed' && (
                            <Banner tone="success">
                              <Text>
                                Processing completed! {jobStatus.processed} products updated successfully.
                                {jobStatus.errors && jobStatus.errors.length > 0 && ` ${jobStatus.errors.length} errors occurred.`}
                              </Text>
                            </Banner>
                          )}

                          {jobStatus.status === 'failed' && (
                            <Banner tone="critical">
                              <Text>Processing failed: {jobStatus.error}</Text>
                            </Banner>
                          )}
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Card>

            {progressSection}
            {resultsSection}
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  CSV Format Guide
                </Text>

                <Text as="h4" variant="headingSm">
                  Product Properties Format:
                </Text>
                <List type="bullet">
                  <List.Item><strong>Handle</strong> - Product handle (required)</List.Item>
                  <List.Item><strong>Title</strong> - Product title</List.Item>
                  <List.Item><strong>Body (HTML)</strong> - Product description</List.Item>
                  <List.Item><strong>Vendor</strong> - Product vendor</List.Item>
                  <List.Item><strong>Type</strong> - Product type</List.Item>
                  <List.Item><strong>Tags</strong> - Comma-separated tags</List.Item>
                  <List.Item><strong>Published</strong> - true/false or 1/0</List.Item>
                  <List.Item><strong>Components</strong> - Custom components metafield</List.Item>
                </List>

                <Divider />

                <Text as="h4" variant="headingSm">
                  Metafields Format:
                </Text>
                <List type="bullet">
                  <List.Item><strong>handle</strong> - Product handle (required)</List.Item>
                  <List.Item><strong>namespace</strong> - Metafield namespace</List.Item>
                  <List.Item><strong>key</strong> - Metafield key</List.Item>
                  <List.Item><strong>value</strong> - Metafield value</List.Item>
                  <List.Item><strong>type</strong> - Metafield type (optional)</List.Item>
                </List>

                <Divider />

                <Text as="h4" variant="headingSm">
                  Example Product Properties CSV:
                </Text>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="bodyMd" fontFamily="mono">
                    Handle,Title,Vendor,Type,Tags,Published<br/>
                    red-snowboard,Red Snowboard,Acme,Snowboard,winter;sports,true<br/>
                    blue-snowboard,Blue Snowboard,Acme,Snowboard,winter;sports,false
                  </Text>
                </Box>

                <Text as="h4" variant="headingSm">
                  Example Metafields CSV:
                </Text>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="bodyMd" fontFamily="mono">
                    handle,namespace,key,value,type<br/>
                    red-snowboard,custom,color,red,single_line_text_field<br/>
                    blue-snowboard,custom,color,blue,single_line_text_field
                  </Text>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
