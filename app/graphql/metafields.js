// GraphQL queries and mutations for metafield operations

export const GET_PRODUCT_BY_HANDLE = `#graphql
  query getProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
      tags
      metafields(first: 250) {
        edges {
          node {
            id
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
`;

export const GET_PRODUCTS_BY_HANDLES = `#graphql
  query getProductsByHandles($query: String!) {
    products(first: 250, query: $query) {
      edges {
        node {
          id
          handle
          title
          metafields(first: 250) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    }
  }
`;

export const SET_METAFIELDS = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
        type
        ownerId
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const UPDATE_PRODUCT_PROPERTIES = `#graphql
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        handle
        title
        descriptionHtml
        vendor
        productType
        tags
        status
        metafields(first: 250) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const UPDATE_PRODUCT_METAFIELDS = `#graphql
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        handle
        title
        metafields(first: 250) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
