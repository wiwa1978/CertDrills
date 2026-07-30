targetScope = 'subscription'

@description('Azure region for all resources.')
param location string = 'germanywestcentral'

@description('Name of the resource group to create or update.')
param resourceGroupName string

@maxLength(26)
@description('Base application name used to derive Azure resource names and tags.')
param appName string

@maxLength(32)
@description('Deployment environment name used in tags and environment-specific configuration.')
param environmentName string = 'production'

@description('External PostgreSQL server fully qualified domain name.')
param postgresServerFqdn string

@description('External PostgreSQL administrator login.')
param postgresAdminLogin string

@secure()
@description('External PostgreSQL administrator password.')
param postgresAdminPassword string

@description('External PostgreSQL database name.')
param postgresDatabaseName string

@description('Container image for the API app.')
param apiImage string

@description('Whether to configure the API liveness probe. Disable only for bootstrap deployments that use placeholder images.')
param enableApiLivenessProbe bool = true

@description('Container image for the web app.')
param webImage string

@description('Container image for the admin app.')
param adminImage string

@description('Optional Azure Container Registry username. First-version bootstrap tradeoff: ACR admin credentials are supported for initial deploys. Leave empty to omit registry credentials.')
param acrUsername string = ''

@secure()
@description('Optional Azure Container Registry password. First-version bootstrap tradeoff: ACR admin credentials are supported for initial deploys. Leave empty to omit registry credentials.')
param acrPassword string = ''

var resourcesDeploymentName = take('container-apps-resources-${uniqueString(resourceGroupName, appName)}', 64)

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    app: appName
    environment: environmentName
  }
}

module resources 'main.resources.bicep' = {
  name: resourcesDeploymentName
  scope: rg
  params: {
    location: location
    appName: appName
    environmentName: environmentName
    postgresServerFqdn: postgresServerFqdn
    postgresAdminLogin: postgresAdminLogin
    postgresAdminPassword: postgresAdminPassword
    postgresDatabaseName: postgresDatabaseName
    apiImage: apiImage
    enableApiLivenessProbe: enableApiLivenessProbe
    webImage: webImage
    adminImage: adminImage
    acrUsername: acrUsername
    acrPassword: acrPassword
  }
}

output acrName string = resources.outputs.acrName
output acrLoginServer string = resources.outputs.acrLoginServer
output apiAppName string = resources.outputs.apiAppName
output webAppName string = resources.outputs.webAppName
output adminAppName string = resources.outputs.adminAppName
output apiFqdn string = resources.outputs.apiFqdn
output webFqdn string = resources.outputs.webFqdn
output adminFqdn string = resources.outputs.adminFqdn
