## PART ZERO

```
# Create a new project in GCP and enable billing. 
# Then open the Cloud Shell and follow along:

export PROJECT_NAME="istio-workshop-x"
gcloud config set project $PROJECT_NAME
```

## PART ONE

### Configure work directory and global variables

```
cd $HOME
mkdir $PROJECT_NAME && cd $PROJECT_NAME
WORKDIR=$(pwd)
gcloud source repos clone istio-workshop . --project=michaelmarkieta-git
git clone https://github.com/ahmetb/kubectx $WORKDIR/kubectx
export VPC_1_NAME="vpc-1"
export REGION_1="us-central1"
export SUBNETWORK_1_NAME="subnet-1"
export CLUSTER_1_NAME="cluster-1"
export KUBECONFIG=istio-kubeconfig
export PATH=$PATH:$WORKDIR/kubectx
export ISTIO_VERSION=1.3.1
export HELM_VERSION=v2.13.0
export HELM_PATH="$WORKDIR"/helm-"$HELM_VERSION"
```

### Enable services in your project

```
gcloud services enable compute.googleapis.com
gcloud services enable monitoring
gcloud services enable container.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable sqladmin.googleapis.com
```

### Delete default networking configuration

```
gcloud -q compute firewall-rules delete default-allow-icmp 
gcloud -q compute firewall-rules delete default-allow-internal 
gcloud -q compute firewall-rules delete default-allow-rdp 
gcloud -q compute firewall-rules delete default-allow-ssh
gcloud -q compute networks delete default
```

### Create a custom VPC with custom subnets

```
gcloud compute networks create $VPC_1_NAME --subnet-mode custom
gcloud compute networks subnets create $SUBNETWORK_1_NAME --network $VPC_1_NAME --region $REGION_1 --range 10.0.0.0/16 --secondary-range pods=10.1.0.0/16,services=10.2.0.0/16
```

### Create a VPC Native GKE Cluster

```
gcloud container clusters create $CLUSTER_1_NAME \
  --region $REGION_1 --enable-ip-alias --network $VPC_1_NAME --subnetwork $SUBNETWORK_1_NAME \
  --machine-type "n1-standard-4" --image-type "COS" --disk-size "100" --num-nodes "1" \
  --enable-stackdriver-kubernetes --no-enable-basic-auth --metadata disable-legacy-endpoints=true \
  --scopes "https://www.googleapis.com/auth/compute","https://www.googleapis.com/auth/devstorage.read_only","https://www.googleapis.com/auth/logging.write","https://www.googleapis.com/auth/monitoring","https://www.googleapis.com/auth/servicecontrol","https://www.googleapis.com/auth/service.management.readonly","https://www.googleapis.com/auth/trace.append"
```

### Collect authentication credentials and set your local kubectx

```
gcloud container clusters get-credentials $CLUSTER_1_NAME --region $REGION_1 --project ${PROJECT_NAME}
kubectx cluster1=gke_${PROJECT_NAME}_${REGION_1}_${CLUSTER_1_NAME}
kubectl create clusterrolebinding user-admin-binding --clusterrole=cluster-admin --user=$(gcloud config get-value account)
```

### Download and install Helm

```
wget https://storage.googleapis.com/kubernetes-helm/helm-"$HELM_VERSION"-linux-amd64.tar.gz
tar -xvzf helm-"$HELM_VERSION"-linux-amd64.tar.gz
mv linux-amd64 "$HELM_PATH"
rm $WORKDIR/helm-"$HELM_VERSION"-linux-amd64.tar.gz
kubectl create namespace istio-system
kubectl create serviceaccount tiller --namespace kube-system
kubectl create clusterrolebinding tiller-admin-binding --clusterrole=cluster-admin --serviceaccount=kube-system:tiller
${HELM_PATH}/helm init --service-account=tiller
${HELM_PATH}/helm update
```

### Create Root CA and Intermediate CA certs for Istio

```
mkdir $HOME/root/ca -p
cd $HOME/root/ca
cp $WORKDIR/openssl-root.cnf openssl.cnf
mkdir certs crl newcerts private
chmod 700 private
touch index.txt
touch index.txt.crl
echo 1000 > index.txt.crl

openssl genrsa -aes256 -out private/ca.key.pem 4096
# Enter pass phrase for ca.key.pem: secretpassword

chmod 400 private/ca.key.pem

openssl req -config openssl.cnf -key private/ca.key.pem -new -x509 -days 7300 -sha256 -extensions v3_ca -out certs/ca.cert.pem
# Enter pass phrase for private/ca.key.pem: password
# You are about to be asked to enter information that will be incorporated
# into your certificate request.
# -----
# Country Name (2 letter code) [GB]:CA
# State or Province Name [England]:Ontario
# Locality Name []:
# Organization Name [Alice Ltd]:Istio Workshop
# Organizational Unit Name []:Istio Workshop Certificate Authority
# Common Name []:Istio Workshop Root CA
# Email Address []:

chmod 444 certs/ca.cert.pem
mkdir $HOME/root/ca/intermediate -p
cd $HOME/root/ca/intermediate
cp $WORKDIR/openssl-intermediate.cnf openssl.cnf
mkdir certs crl csr newcerts private
chmod 700 private
touch index.txt
touch index.txt.crl
echo 1000 > index.txt.crl
cd $HOME/root/ca

openssl genrsa -aes256 -out intermediate/private/intermediate.key.pem 4096
# Enter pass phrase for intermediate/private/intermediate.key.pem: password
# You are about to be asked to enter information that will be incorporated
# into your certificate request.
# -----
# Country Name (2 letter code) [GB]:CA
# State or Province Name [England]:Ontario
# Locality Name []:
# Organization Name [Alice Ltd]:Istio Workshop
# Organizational Unit Name []:Istio Workshop Certificate Authority
# Common Name []:Istio Workshop Intermediate CA
# Email Address []:


chmod 400 intermediate/private/intermediate.key.pem
openssl req -config intermediate/openssl.cnf -new -sha256 -key intermediate/private/intermediate.key.pem -out intermediate/csr/intermediate.csr.pem
# Enter pass phrase for www.example.com.key.pem: password
# You are about to be asked to enter information that will be incorporated
# into your certificate request.
# -----
# Country Name (2 letter code) [GB]:CA
# State or Province Name [England]:Ontario
# Locality Name []:
# Organization Name [Alice Ltd]:Istio Workshop
# Organizational Unit Name []:Istio Workshop Web Services
# Common Name []:www.istioworkshop.com
# Email Address []:

openssl ca -config openssl.cnf -extensions v3_intermediate_ca -days 3650 -notext -md sha256 -in intermediate/csr/intermediate.csr.pem -out intermediate/certs/intermediate.cert.pem
# Using configuration from openssl.cnf
# Enter pass phrase for /home/admin_/root/ca/private/ca.key.pem: password
# Check that the request matches the signature
# Signature ok
# Certificate Details:
#         Serial Number: 4096 (0x1000)
#         Validity
#             Not Before: Nov  7 06:50:30 2019 GMT
#             Not After : Nov  4 06:50:30 2029 GMT
#         Subject:
#             countryName               = CA
#             stateOrProvinceName       = Ontario
#             organizationName          = Istio Workshop
#             organizationalUnitName    = Istio Workshop Web Services
#             commonName                = www.istioworkshop.com
#         X509v3 extensions:
#             X509v3 Subject Key Identifier:
#                 71:2E:5E:DE:46:2E:EC:09:3F:CC:28:9F:58:74:1A:91:DB:17:8A:C7
#             X509v3 Authority Key Identifier:
#                 keyid:3C:34:D8:CA:55:60:ED:00:D1:11:6D:A8:B3:8A:08:46:00:AD:60:C3
# 
#             X509v3 Basic Constraints: critical
#                 CA:TRUE, pathlen:0
#             X509v3 Key Usage: critical
#                 Digital Signature, Certificate Sign, CRL Sign
# Certificate is to be certified until Nov  4 06:50:30 2029 GMT (3650 days)
# Sign the certificate? [y/n]:y
# 
# 
# 1 out of 1 certificate requests certified, commit? [y/n]y
# Write out database with 1 new entries
# Data Base Updated

cat intermediate/certs/intermediate.cert.pem certs/ca.cert.pem > intermediate/certs/ca-chain.cert.pem
chmod 444 intermediate/certs/ca-chain.cert.pem

mkdir $WORKDIR/certs
cp $HOME/root/ca/certs/ca.cert.pem $WORKDIR/certs/root-cert.pem
cp $HOME/root/ca/intermediate/certs/intermediate.cert.pem $WORKDIR/certs/ca-cert.pem
cp $HOME/root/ca/intermediate/private/intermediate.key.pem $WORKDIR/certs/ca-key.encrypted.pem
openssl rsa -in $WORKDIR/certs/ca-key.encrypted.pem -out $WORKDIR/certs/ca-key.pem -passin pass:password
cp $HOME/root/ca/intermediate/certs/ca-chain.cert.pem $WORKDIR/certs/cert-chain.pem
```

### Prepare our GKE cluster with CA and Kiali secrets

```
cd $WORKDIR
kubectl create secret generic cacerts -n istio-system --from-file=$WORKDIR/certs/ca-cert.pem --from-file=$WORKDIR/certs/ca-key.pem --from-file=$WORKDIR/certs/root-cert.pem --from-file=$WORKDIR/certs/cert-chain.pem;
kubectl create secret generic kiali -n istio-system --from-literal=username=admin --from-literal=passphrase=admin
```

### Download and install Istio (with Grafana, Distributed Tracing, and Kiali)

```
wget https://github.com/istio/istio/releases/download/${ISTIO_VERSION}/istio-${ISTIO_VERSION}-linux.tar.gz
tar -xzf istio-${ISTIO_VERSION}-linux.tar.gz
rm -r istio-${ISTIO_VERSION}-linux.tar.gz
${HELM_PATH}/helm install istio-${ISTIO_VERSION}/install/kubernetes/helm/istio-init --name istio-init --namespace istio-system;
# Wait for istio CRDs to install before continuing

${HELM_PATH}/helm install istio-${ISTIO_VERSION}/install/kubernetes/helm/istio --name istio --namespace istio-system --values $WORKDIR/values.yaml
```

### Prepare our GKE cluster with Cloud SQL, Redis and Elasticsearch secrets

```
kubectl create secret generic cloudsql-db-credentials --from-literal=username=istioworkshop --from-literal=password=password
kubectl create secret generic redis-password-file --from-literal=redis-password=password
kubectl create secret generic elasticsearch-es-elastic-user --from-literal=elastic=password
```

### Deploy 05-search using an Elasticsearch K8s Operator

```
kubectl apply -f https://download.elastic.co/downloads/eck/1.0.0-beta1/all-in-one.yaml
# Wait for elastic-operator stateful set to come online before continuing

kubectl apply -f 05-search/gke/elasticsearch.yaml
```

### Deploy 04-cache using a Redis Helm Chart

```
helm install --name redis-default stable/redis --values 04-cache/values.yaml
```

### Create a private connection to Google managed services for Cloud SQL

```
gcloud compute addresses create google-managed-services-$VPC_1_NAME --network=$VPC_1_NAME --global --purpose=VPC_PEERING --prefix-length=16
gcloud services vpc-peerings connect --network=$VPC_1_NAME --ranges=google-managed-services-$VPC_1_NAME --service=servicenetworking.googleapis.com --project=$PROJECT_NAME
```

### Launch a Cloud SQL instance, and use a jump box to create a user and database

```
gcloud beta sql instances create mysql --tier=db-n1-standard-2 --region=$REGION_1 --network=$VPC_1_NAME --no-assign-ip
gcloud compute instances create mysql-admin --network=$VPC_1_NAME --subnet=$SUBNETWORK_1_NAME --zone=$REGION_1-f --scopes=sql-admin
gcloud compute instances add-tags mysql-admin --zone=$REGION_1-f --tags allow-ssh
gcloud compute firewall-rules create allow-ssh --allow=tcp:22 --network=$VPC_1_NAME --target-tags=allow-ssh --source-ranges=0.0.0.0/0
gcloud compute ssh mysql-admin --zone=$REGION_1-f
gcloud sql users create istioworkshop --instance=mysql --password=password --host=%
gcloud sql databases create istioworkshop --instance=mysql
exit
gcloud -q compute instances delete mysql-admin --zone=$REGION_1-f
gcloud -q compute firewall-rules delete allow-ssh
```

### Set up secrets for Cloud SQL Proxy in GKE

```
gcloud iam service-accounts create sa-cloudsql
gcloud projects add-iam-policy-binding $PROJECT_NAME --member=serviceAccount:sa-cloudsql@$PROJECT_NAME.iam.gserviceaccount.com --role=roles/cloudsql.client
gcloud iam service-accounts keys create $WORKDIR/03-database/sa-cloudsql.json --iam-account=sa-cloudsql@$PROJECT_NAME.iam.gserviceaccount.com
kubectl create secret generic cloudsql-instance-credentials --from-file=credentials.json=$WORKDIR/03-database/sa-cloudsql.json
rm $WORKDIR/03-database/sa-cloudsql.json
```

### Deploy 03-database

```
sed 's#$INSTANCE_CONNECTION_NAME#'"${PROJECT_NAME}:${REGION_1}:mysql"'#g' $WORKDIR/03-database/gke/deployment.template.yaml > $WORKDIR/03-database/gke/deployment.yaml
cd $WORKDIR
kubectl apply -f 03-database/gke/deployment.yaml,03-database/gke/service.yaml
```

### Build and deploy 02-backend

```
cd $WORKDIR/02-backend
docker build -t gcr.io/$PROJECT_NAME/02-backend .
docker push gcr.io/$PROJECT_NAME/02-backend
export IMAGE_SHA=$(docker inspect --format='{{index .RepoDigests 0}}' gcr.io/$PROJECT_NAME/02-backend)
sed 's#$IMAGE_SHA#'"${IMAGE_SHA}"'#g' $WORKDIR/02-backend/gke/deployment.template.yaml > $WORKDIR/02-backend/gke/deployment.yaml
cd $WORKDIR
kubectl apply -f 02-backend/gke/deployment.yaml,02-backend/gke/service.yaml
```

### Build and deploy 01-frontend

```
cd $WORKDIR/01-frontend
docker build -t gcr.io/$PROJECT_NAME/01-frontend .
docker push gcr.io/$PROJECT_NAME/01-frontend
export IMAGE_SHA=$(docker inspect --format='{{index .RepoDigests 0}}' gcr.io/$PROJECT_NAME/01-frontend)
sed 's#$IMAGE_SHA#'"${IMAGE_SHA}"'#g' $WORKDIR/01-frontend/gke/deployment.template.yaml > $WORKDIR/01-frontend/gke/deployment.yaml
cd $WORKDIR
kubectl apply -f 01-frontend/gke/deployment.yaml,01-frontend/gke/service.yaml,01-frontend/gke/ingress.yaml
```

### Wait for frontend ingress to come online

```
export FRONTEND_IP=$(bash -c 'external_ip=""; while [ -z $external_ip ]; do external_ip=$(kubectl get ingress frontend --template="{{range .status.loadBalancer.ingress}}{{.ip}}{{end}}"); [ -z "$external_ip" ] && sleep 10; done; echo $external_ip; export endpoint=$external_ip')
# Succesful connection may take up to 5 minutes due to the nature of our global SDN
```

### Build and deploy 00-loadgen

```
cd $WORKDIR/00-loadgen
docker build -t gcr.io/$PROJECT_NAME/00-loadgen .
docker push gcr.io/$PROJECT_NAME/00-loadgen
export IMAGE_SHA=$(docker inspect --format='{{index .RepoDigests 0}}' gcr.io/$PROJECT_NAME/00-loadgen)
sed 's#$IMAGE_SHA#'"${IMAGE_SHA}"'#g' $WORKDIR/00-loadgen/gke/deployment.template.yaml > $WORKDIR/00-loadgen/gke/deployment.yaml
cd $WORKDIR
kubectl apply -f 00-loadgen/gke/deployment.yaml
```

### Explore the application, GKE UI, Cloud SQL, Stackdriver, Kiali, Grafana, Jaeger, etc

```
kubectl -n istio-system port-forward $(kubectl -n istio-system get pod -l app=kiali -o jsonpath='{.items[0].metadata.name}') 20001:20001
kubectl -n istio-system port-forward $(kubectl -n istio-system get pod -l app=grafana -o jsonpath='{.items[0].metadata.name}') 3000:3000
kubectl -n istio-system port-forward $(kubectl -n istio-system get pod -l app=jaeger -o jsonpath='{.items[0].metadata.name}') 16686:16686
```

## PART TWO

### Create a new namespace and enable automatic istio sidecar injection

```
kubectl create namespace xyz
kubectl label namespace xyz istio-injection=enabled
```

### Copy secrets from default namespace

```
kubectl get secret cloudsql-db-credentials --namespace=default -oyaml | sed s/"namespace: default"/"namespace: xyz"/ | kubectl apply --namespace=xyz -f -
kubectl get secret cloudsql-instance-credentials --namespace=default -oyaml | sed s/"namespace: default"/"namespace: xyz"/ | kubectl apply --namespace=xyz -f -
kubectl get secret redis-password-file --namespace=default -oyaml | sed s/"namespace: default"/"namespace: xyz"/ | kubectl apply --namespace=xyz -f -
kubectl get secret elasticsearch-es-elastic-user --namespace=default -oyaml | sed s/"namespace: default"/"namespace: xyz"/ | kubectl apply --namespace=xyz -f -
```


### Deploy workload

```
kubectl -n xyz apply -f 05-search/gke/elasticsearch.yaml
helm install --namespace xyz --name redis-xyz stable/redis --values 04-cache/values.yaml
kubectl apply -n xyz -f 03-database/gke/deployment.yaml,03-database/gke/service.yaml
kubectl apply -n xyz -f 02-backend/gke/deployment.yaml,02-backend/gke/service.yaml
kubectl apply -n xyz -f 01-frontend/gke/deployment.yaml,01-frontend/gke/service-xyz.yaml,01-frontend/gke/gateway.yaml,01-frontend/gke/virtualservice.yaml
kubectl apply -n xyz -f 00-loadgen/gke/deployment.yaml
```

### Explore the application, Kiali, Grafana, Jaeger, etc

```
kubectl -n istio-system port-forward $(kubectl -n istio-system get pod -l app=kiali -o jsonpath='{.items[0].metadata.name}') 20001:20001
kubectl -n istio-system port-forward $(kubectl -n istio-system get pod -l app=grafana -o jsonpath='{.items[0].metadata.name}') 3000:3000
kubectl -n istio-system port-forward $(kubectl -n istio-system get pod -l app=jaeger -o jsonpath='{.items[0].metadata.name}') 16686:16686
```

### TODO

```
1. instrument application for spans and tracing
2. configure authentication policies and destination rules
3. enforce service level access control with istio authorization
4. build virtual services for all services
```