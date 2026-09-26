// Atlas Ekonomi Sabah — Azure infrastructure (plan §04, §10).
// Smallest SKUs, scale-to-zero, budget alerts. Deploy with infra/azure/deploy.sh.
targetScope = 'resourceGroup'

@description('Short prefix for resource names, e.g. atlasbeta')
param prefix string = 'atlas'
param location string = 'southeastasia'
@description('Email for budget alerts')
param alertEmail string
@description('Monthly budget in the subscription currency')
param monthlyBudget int = 150
@secure()
param dbPassword string
@secure()
param azureOpenAiKey string = ''
param azureOpenAiEndpoint string = ''
param llmDeployment string = ''
param routerDeployment string = ''
param briefDeployment string = ''
param embedDeployment string = ''
@secure()
param earthdataToken string = ''
@secure()
param reviewToken string
param apiImage string = 'mcr.microsoft.com/k8se/quickstart:latest'
param webImage string = 'mcr.microsoft.com/k8se/quickstart:latest'
@description('Custom domains already bound to the web app ([{name, certificateId, bindingType}]); deploy.sh passes the live list so redeploys keep them')
param webCustomDomains array = []
param budgetStartDate string = '${utcNow('yyyy-MM')}-01'

var uniq = uniqueString(resourceGroup().id)
var dbUrl = 'postgresql+psycopg://atlas:${dbPassword}@${pg.properties.fullyQualifiedDomainName}:5432/atlas?sslmode=require'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-ai'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${prefix}acr${uniq}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-id'
  location: location
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, 'acrpull')
  scope: acr
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: '${prefix}st${uniq}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: true, minimumTlsVersion: 'TLS1_2', isHnsEnabled: true }
}

resource blobSvc 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource releases 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobSvc
  name: 'releases'
  properties: { publicAccess: 'Blob' }
}

resource lake 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobSvc
  name: 'lake'
  properties: { publicAccess: 'None' }
}

resource blobWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, 'blobcontrib')
  scope: storage
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${uniq}'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: 'atlas'
    administratorLoginPassword: dbPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource pgExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'azure.extensions'
  properties: { value: 'POSTGIS,VECTOR', source: 'user-override' }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: 'atlas'
}

resource pgAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: pg
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

var secrets = [
  { name: 'db-url', value: dbUrl }
  { name: 'aoai-key', value: empty(azureOpenAiKey) ? 'unset' : azureOpenAiKey }
  { name: 'earthdata', value: empty(earthdataToken) ? 'unset' : earthdataToken }
  { name: 'review-token', value: reviewToken }
  { name: 'appinsights', value: insights.properties.ConnectionString }
]
var commonEnv = [
  { name: 'ATLAS_DATABASE_URL', secretRef: 'db-url' }
  { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
  { name: 'AZURE_OPENAI_API_KEY', secretRef: 'aoai-key' }
  { name: 'ATLAS_LLM_DEPLOYMENT', value: llmDeployment }
  { name: 'ATLAS_LLM_ROUTER_DEPLOYMENT', value: routerDeployment }
  { name: 'ATLAS_BRIEF_DEPLOYMENT', value: briefDeployment }
  { name: 'ATLAS_EMBED_DEPLOYMENT', value: embedDeployment }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights' }
]

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-api'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 8000, transport: 'auto' }
      registries: [ { server: acr.properties.loginServer, identity: identity.id } ]
      secrets: secrets
    }
    template: {
      containers: [ {
        name: 'api'
        image: apiImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(commonEnv, [
          { name: 'ATLAS_REVIEW_TOKEN', secretRef: 'review-token' }
          { name: 'ATLAS_CORS_ORIGINS', value: '*' }
        ])
        probes: [ { type: 'Readiness', httpGet: { path: '/healthz', port: 8000 } } ]
      } ]
      scale: { minReplicas: 0, maxReplicas: 2 }
    }
  }
  dependsOn: [ acrPull ]
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-web'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto', customDomains: webCustomDomains }
      registries: [ { server: acr.properties.loginServer, identity: identity.id } ]
    }
    template: {
      containers: [ {
        name: 'web'
        image: webImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'ATLAS_API_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }
          { name: 'NEXT_PUBLIC_ATLAS_API_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }
          { name: 'ATLAS_RELEASES_BASE_URL', value: '${storage.properties.primaryEndpoints.blob}releases' }
        ]
      } ]
      scale: { minReplicas: 0, maxReplicas: 2 }
    }
  }
  dependsOn: [ acrPull ]
}

// Weekly pipeline: checks OpenDOSM for new vintages, rebuilds and reloads. Same image as the API.
resource pipeline 'Microsoft.App/jobs@2024-03-01' = {
  name: '${prefix}-pipeline'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Schedule'
      scheduleTriggerConfig: { cronExpression: '0 2 * * 1', parallelism: 1, replicaCompletionCount: 1 }
      replicaTimeout: 3600
      replicaRetryLimit: 1
      registries: [ { server: acr.properties.loginServer, identity: identity.id } ]
      secrets: secrets
    }
    template: {
      containers: [ {
        name: 'pipeline'
        image: apiImage
        command: [ 'atlas', 'build' ]
        resources: { cpu: json('1.0'), memory: '2Gi' }
        env: concat(commonEnv, [
          { name: 'EARTHDATA_TOKEN', secretRef: 'earthdata' }
          { name: 'ATLAS_RELEASES_CONTAINER_URL', value: '${storage.properties.primaryEndpoints.blob}releases' }
          { name: 'ATLAS_LAKE_CONTAINER_URL', value: '${storage.properties.primaryEndpoints.blob}lake' }
          { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
        ])
      } ]
    }
  }
  dependsOn: [ acrPull, blobWriter ]
}

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: '${prefix}-budget'
  properties: {
    category: 'Cost'
    amount: monthlyBudget
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    notifications: {
      at50: { enabled: true, operator: 'GreaterThan', threshold: 50, contactEmails: [ alertEmail ] }
      at80: { enabled: true, operator: 'GreaterThan', threshold: 80, contactEmails: [ alertEmail ] }
      at100: { enabled: true, operator: 'GreaterThan', threshold: 100, contactEmails: [ alertEmail ] }
    }
  }
}

output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output acrLoginServer string = acr.properties.loginServer
output storageAccount string = storage.name
output pgHost string = pg.properties.fullyQualifiedDomainName
output releasesUrl string = '${storage.properties.primaryEndpoints.blob}releases'
