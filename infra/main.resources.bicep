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

var normalizedName = toLower(replace(appName, '_', '-'))
var compactName = toLower(replace(replace(appName, '-', ''), '_', ''))
var uniqueSuffix = substring(uniqueString(resourceGroup().id, appName), 0, 8)

var acrName = take('acr${take(compactName, 39)}${uniqueSuffix}', 50)
var privacyExportStorageAccountName = take('st${take(compactName, 13)}${uniqueSuffix}', 24)
var privacyExportContainerName = 'privacy-exports'
var logAnalyticsName = take('${normalizedName}-law', 63)
var containerAppsEnvironmentName = take('${normalizedName}-cae', 60)
var apiAppName = take('${normalizedName}-api', 32)
var webAppName = take('${normalizedName}-web', 32)
var adminAppName = take('${normalizedName}-admin', 32)
var apiRegistryIdentityName = take('${normalizedName}-api-acr-pull', 128)
var webRegistryIdentityName = take('${normalizedName}-web-acr-pull', 128)
var adminRegistryIdentityName = take('${normalizedName}-admin-acr-pull', 128)
var acrPullRoleDefinitionId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var postgresServerHost = split(postgresServerFqdn, ':')[0]
var databaseUrl = 'postgresql://${uriComponent(postgresRuntimeLogin)}:${uriComponent(postgresRuntimePassword)}@${postgresServerHost}:5432/${uriComponent(postgresDatabaseName)}?sslmode=require'

var tags = {
  app: appName
  environment: environmentName
}


var apiSecrets = [
  {
    name: 'database-url'
    value: databaseUrl
  }
  {
    name: 'privacy-export-storage-connection-string'
    value: 'DefaultEndpointsProtocol=https;AccountName=${privacyExportStorage.name};AccountKey=${privacyExportStorage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
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
    adminUserEnabled: false
  }
}
resource apiRegistryIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: apiRegistryIdentityName
  location: location
  tags: tags
}

resource webRegistryIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: webRegistryIdentityName
  location: location
  tags: tags
}

resource adminRegistryIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: adminRegistryIdentityName
  location: location
  tags: tags
}

resource apiRegistryAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, apiRegistryIdentity.id, acrPullRoleDefinitionId)
  scope: acr
  properties: {
    principalId: apiRegistryIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

resource webRegistryAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, webRegistryIdentity.id, acrPullRoleDefinitionId)
  scope: acr
  properties: {
    principalId: webRegistryIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

resource adminRegistryAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, adminRegistryIdentity.id, acrPullRoleDefinitionId)
  scope: acr
  properties: {
    principalId: adminRegistryIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

resource privacyExportStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: privacyExportStorageAccountName
  location: location
  tags: union(tags, { purpose: 'privacy-exports' })
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource privacyExportBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: privacyExportStorage
  name: 'default'
  properties: {}
}

resource privacyExportContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: privacyExportBlobService
  name: privacyExportContainerName
  properties: {
    publicAccess: 'None'
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
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiRegistryIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3302
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: apiRegistryIdentity.id
        }
      ]
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING'
              secretRef: 'privacy-export-storage-connection-string'
            }
            {
              name: 'AZURE_PRIVACY_EXPORT_STORAGE_CONTAINER'
              value: privacyExportContainerName
            }
          ]
          probes: enableContainerAppProbes ? [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3302
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3302
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
              successThreshold: 1
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
  dependsOn: [
    apiRegistryAcrPull
  ]
}

resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: webAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${webRegistryIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3300
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: webRegistryIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: enableContainerAppProbes ? [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3300
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3300
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
              successThreshold: 1
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
  dependsOn: [
    webRegistryAcrPull
  ]
}

resource adminApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: adminAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${adminRegistryIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3301
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: adminRegistryIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'admin'
          image: adminImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: enableContainerAppProbes ? [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3301
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3301
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
              successThreshold: 1
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
  dependsOn: [
    adminRegistryAcrPull
  ]
}

var monitoredContainerApps = [
  {
    name: apiApp.name
    id: apiApp.id
    displayName: 'API'
  }
  {
    name: webApp.name
    id: webApp.id
    displayName: 'Web'
  }
  {
    name: adminApp.name
    id: adminApp.id
    displayName: 'Admin'
  }
]

resource productionActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: take('${normalizedName}-production-operators', 260)
  location: 'global'
  tags: tags
  properties: {
    groupShortName: take('${compactName}-ops', 12)
    enabled: true
    emailReceivers: [
      {
        name: 'Production operator'
        emailAddress: alertOperatorEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource zeroReplicaAlerts 'Microsoft.Insights/metricAlerts@2018-03-01' = [for app in monitoredContainerApps: {
  name: take('${app.name}-zero-replicas', 260)
  location: 'global'
  tags: tags
  properties: {
    description: '${app.displayName} Container App has averaged fewer than one replica for five minutes.'
    severity: 1
    enabled: true
    scopes: [app.id]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    autoMitigate: true
    targetResourceType: 'Microsoft.App/containerApps'
    targetResourceRegion: location
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'ZeroReplicas'
          metricName: 'Replicas'
          metricNamespace: 'Microsoft.App/containerApps'
          operator: 'LessThan'
          threshold: 1
          timeAggregation: 'Average'
          skipMetricValidation: false
        }
      ]
    }
    actions: [
      {
        actionGroupId: productionActionGroup.id
      }
    ]
  }
}]

resource elevatedFiveHundredAlerts 'Microsoft.Insights/metricAlerts@2018-03-01' = [for app in monitoredContainerApps: {
  name: take('${app.name}-elevated-http-5xx', 260)
  location: 'global'
  tags: tags
  properties: {
    description: '${app.displayName} Container App served more than 10 HTTP 5xx responses in five minutes.'
    severity: 2
    enabled: true
    scopes: [app.id]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    autoMitigate: true
    targetResourceType: 'Microsoft.App/containerApps'
    targetResourceRegion: location
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'ElevatedHttp5xx'
          metricName: 'Requests'
          metricNamespace: 'Microsoft.App/containerApps'
          operator: 'GreaterThan'
          threshold: 10
          timeAggregation: 'Total'
          dimensions: [
            {
              name: 'statusCodeCategory'
              operator: 'Include'
              values: ['5xx']
            }
          ]
          skipMetricValidation: false
        }
      ]
    }
    actions: [
      {
        actionGroupId: productionActionGroup.id
      }
    ]
  }
}]

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output apiAppName string = apiApp.name
output webAppName string = webApp.name
output adminAppName string = adminApp.name
output privacyExportStorageAccountName string = privacyExportStorage.name
output privacyExportStorageContainerName string = privacyExportContainerName
output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output webFqdn string = webApp.properties.configuration.ingress.fqdn
output adminFqdn string = adminApp.properties.configuration.ingress.fqdn
