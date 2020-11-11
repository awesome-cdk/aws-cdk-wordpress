import {Construct, Stack, StackProps} from "@aws-cdk/core";
import {Vpc} from "@aws-cdk/aws-ec2";
import {ApplicationListener, ApplicationLoadBalancer as ALB} from "@aws-cdk/aws-elasticloadbalancingv2";

export class ApplicationLoadBalancer extends Stack {
    public loadBalancer: ALB;
    private listener: ApplicationListener;

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const vpc = Vpc.fromLookup(this, 'vpc', {
            isDefault: true,
        })

        // Create the load balancer in a VPC. 'internetFacing' is 'false'
        // by default, which creates an internal load balancer.
        this.loadBalancer = new ALB(this, 'LB', {
            vpc,
            internetFacing: true
        });

        // Add a listener and open up the load balancer's security group
        // to the world.
        // this.listener = this.loadBalancer.addListener('HTTPListener', {
        //     port: 80,
        //
        //     // 'open: true' is the default, you can leave it out if you want. Set it
        //     // to 'false' and use `listener.connections` if you want to be selective
        //     // about who can access the load balancer.
        //     open: true,
        // });

    }
}