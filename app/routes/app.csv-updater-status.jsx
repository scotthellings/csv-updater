import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  ProgressBar,
  Button,
  Banner
} from "@shopify/polaris";
import { useEffect, useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  // This would be a simple status endpoint
  // For now, return a placeholder
  return json({
    status: "idle",
    progress: 0,
    processed: 0,
    total: 0,
    errors: []
  });
};

export default function CSVUpdaterStatus() {
  const initialData = useLoaderData();
  const fetcher = useFetcher();
  const [status, setStatus] = useState(initialData);

  // Poll for status updates every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (status.status === "processing") {
        fetcher.load("/app/csv-updater-status");
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status.status, fetcher]);

  // Update status when fetcher data changes
  useEffect(() => {
    if (fetcher.data) {
      setStatus(fetcher.data);
    }
  }, [fetcher.data]);

  const getStatusBadge = () => {
    switch (status.status) {
      case "processing":
        return <Badge tone="info">Processing</Badge>;
      case "completed":
        return <Badge tone="success">Completed</Badge>;
      case "error":
        return <Badge tone="critical">Error</Badge>;
      default:
        return <Badge>Idle</Badge>;
    }
  };

  return (
    <Page
      title="CSV Processing Status"
      backAction={{ content: "Back to CSV Updater", url: "/app/csv-updater" }}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text variant="headingMd">Processing Status</Text>
              {getStatusBadge()}
            </InlineStack>
            
            {status.status === "processing" && (
              <BlockStack gap="300">
                <Text>
                  Processing {status.processed} of {status.total} products...
                </Text>
                <ProgressBar 
                  progress={(status.processed / status.total) * 100} 
                  size="large"
                />
                <Text variant="bodySm" color="subdued">
                  This may take several minutes for large datasets.
                </Text>
              </BlockStack>
            )}

            {status.status === "completed" && (
              <Banner tone="success">
                <Text>
                  Successfully processed {status.processed} products!
                </Text>
              </Banner>
            )}

            {status.errors && status.errors.length > 0 && (
              <Banner tone="warning">
                <Text>
                  {status.errors.length} errors occurred during processing.
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {status.status === "completed" || status.status === "error" ? (
          <Card>
            <InlineStack align="center">
              <Button url="/app/csv-updater" primary>
                Process Another CSV
              </Button>
            </InlineStack>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
