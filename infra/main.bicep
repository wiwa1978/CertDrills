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

@description('Least-privilege PostgreSQL runtime login used by the API.')
param postgresRuntimeLogin string

@secure()
@description('Least-privilege PostgreSQL runtime password used by the API.')
param postgresRuntimePassword string

@description('External PostgreSQL database name.')
param postgresDatabaseName string

@description('Container image for the API app.')
param apiImage string

@description('Whether to configure liveness and readiness probes. Disable only while bootstrap images are running.')
param enableContainerAppProbes bool = true

@description('Container image for the web app.')
param webImage string

@description('Container image for the admin app.')
param adminImage string

@minLength(3)
@description('Email address that receives Azure Monitor production alerts through the shared action group.')
param alertOperatorEmail string

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
    postgresRuntimeLogin: postgresRuntimeLogin
    postgresRuntimePassword: postgresRuntimePassword
    postgresDatabaseName: postgresDatabaseName
    apiImage: apiImage
    enableContainerAppProbes: enableContainerAppProbes
    webImage: webImage
    adminImage: adminImage
    alertOperatorEmail: alertOperatorEmail
  }
}

output acrName string = resources.outputs.acrName
output acrLoginServer string = resources.outputs.acrLoginServer
output apiAppName string = resources.outputs.apiAppName
output webAppName string = resources.outputs.webAppName
output adminAppName string = resources.outputs.adminAppName
output privacyExportStorageAccountName string = resources.outputs.privacyExportStorageAccountName
output privacyExportStorageContainerName string = resources.outputs.privacyExportStorageContainerName
output apiFqdn string = resources.outputs.apiFqdn
output webFqdn string = resources.outputs.webFqdn
output adminFqdn string = resources.outputs.adminFqdn
