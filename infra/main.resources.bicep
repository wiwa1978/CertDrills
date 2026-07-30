targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string

@maxLength(26)
@description('Base application name used to derive Azure resource names and tags.')
param appName string

@maxLength(32)
@description('Deployment environment name used in tags and environment-specific configuration.')
param environmentName string

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

var normalizedName = toLower(replace(appName, '_', '-'))
var compactName = toLower(replace(replace(appName, '-', ''), '_', ''))
var uniqueSuffix = substring(uniqueString(resourceGroup().id, appName), 0, 8)

var acrName = take('acr${take(compactName, 39)}${uniqueSuffix}', 50)
var logAnalyticsName = take('${normalizedName}-law', 63)
var containerAppsEnvironmentName = take('${normalizedName}-cae', 60)
var apiAppName = take('${normalizedName}-api', 32)
var webAppName = take('${normalizedName}-web', 32)
var adminAppName = take('${normalizedName}-admin', 32)
var hasRegistryCredentials = !empty(acrUsername) && !empty(acrPassword)
var databaseUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgresServerFqdn}:5432/${postgresDatabaseName}?sslmode=require'

var tags = {
  app: appName
  environment: environmentName
}

var registryCredentials = [
  {
    server: acr.properties.loginServer
    username: acrUsername
    passwordSecretRef: 'acr-password'
  }
]

var registrySecrets = [
  {
    name: 'acr-password'
    value: acrPassword
  }
]

var apiSecrets = [
  {
    name: 'database-url'
    value: databaseUrl
  }
]

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  tags: tags
  properties: {
    // First-version bootstrap tradeoff: keep admin enabled until later deployment tasks add managed registry access.
    adminUserEnabled: true
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: union({
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8877
        transport: 'auto'
      }
      secrets: concat(apiSecrets, hasRegistryCredentials ? registrySecrets : [])
    }, hasRegistryCredentials ? {
      registries: registryCredentials
    } : {})
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: enableApiLivenessProbe ? [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8877
              }
              initialDelaySeconds: 30
              periodSeconds: 30
            }
          ] : []
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: webAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: union({
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3200
        transport: 'auto'
      }
    }, hasRegistryCredentials ? {
      registries: registryCredentials
      secrets: registrySecrets
    } : {})
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

resource adminApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: adminAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: union({
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3201
        transport: 'auto'
      }
    }, hasRegistryCredentials ? {
      registries: registryCredentials
      secrets: registrySecrets
    } : {})
    template: {
      containers: [
        {
          name: 'admin'
          image: adminImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output apiAppName string = apiApp.name
output webAppName string = webApp.name
output adminAppName string = adminApp.name
output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output webFqdn string = webApp.properties.configuration.ingress.fqdn
output adminFqdn string = adminApp.properties.configuration.ingress.fqdn
