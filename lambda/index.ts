import { APIGatewayEvent, Context, Callback } from "aws-lambda";
import { ApiGatewayManagementApi } from "aws-sdk";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, GetCommand} from "@aws-sdk/lib-dynamodb";

export const handler = async (
    event: APIGatewayEvent,
    context: Context,
    callback: Callback
) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    const connectionId = event.requestContext.connectionId;
    const body = event.body

    const apiGwManagementApi = new ApiGatewayManagementApi({
        endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    });
    const client = new DynamoDBClient();
    const docClient = DynamoDBDocumentClient.from(client);

    async function putConnection(connectionId: string, connectionType: string) {
        const params = {
            TableName: "ConnectionsTable",
            Item: {
                connection_id: connectionId,
                connection_type: connectionType,
            },
        };
        try {
            const command = new PutCommand(params);
            await docClient.send(command);
            console.log("Record written successfully!");
        } catch (error) {
            console.error("Error writing to DynamoDB:", error);
        }
    }

    async function deleteConnection(connectionId: string) {
        const params = {
            TableName: "ConnectionsTable",
            Key: {
                connection_id: connectionId,
            },
        };
        try {
            const command = new DeleteCommand(params);
            await docClient.send(command);
            console.log("Item deleted successfully!");
            return null;
        } catch (error) {
            console.error("Error deleting item:", error);
            return null;
        }
    }


    async function scanByConnectionType(connectionType: string) {
        try {
            const params = {
                TableName: "ConnectionsTable",
                IndexName: "ConnectionTypeIndex",
                KeyConditionExpression: "#cxt = :cxt",
                ExpressionAttributeNames: {
                    "#cxt": "connection_type",
                },
                ExpressionAttributeValues: {
                    ":cxt": connectionType,
                },
            };

            console.log(params)

            const command = new QueryCommand(params);
            const { Items } = await client.send(command);

            console.log("Items:", Items);
            return Items;
        } catch (error) {
            console.error("Error querying GSI:", error);
            return null;
        }
    }


    async function getConnection(connectionId: string) {
        try {
            const params = {
                TableName: "ConnectionsTable",
                Key: {
                    connection_id: connectionId,
                },
            };

            const command = new GetCommand(params);
            const { Item } = await client.send(command);

            if (Item) {
                console.log("Item retrieved:", Item);
                return Item;
            } else {
                console.log("Item not found");
                return null;
            }
        } catch (error) {
            console.error("Error fetching item:", error);
            return null;
        }
    }

    try {
        if (event.requestContext.routeKey === "$default" && body === "AIConnect") {
            await putConnection(connectionId!, "AI")
            const responseMessage = `AI connected!`;
            await apiGwManagementApi.postToConnection(
                {ConnectionId: connectionId!, Data: JSON.stringify(responseMessage),}
            ).promise();
        }
        else if (event.requestContext.routeKey === "$default" && body === "HumanConnect") {
            await putConnection(connectionId!, "HUMAN")
            const responseMessage = "Human connected!";
            await apiGwManagementApi.postToConnection(
                {ConnectionId: connectionId!, Data: JSON.stringify(responseMessage),}
            ).promise();
        }
        else if (event.requestContext.routeKey == "$connect") {
            console.log(`Got connection: ${connectionId}`)
        }
        else if (event.requestContext.routeKey == "$disconnect") {
            await deleteConnection(connectionId!)
        }
        else if (event.requestContext.routeKey === "$default") {
            const connection = await getConnection(connectionId!)
            if (connection) {
                const cx_type = connection["connection_type"]
                console.log(`CX Type of caller ${connection} - ${cx_type}`)
                if (cx_type === "AI") {
                    const humans = await scanByConnectionType("HUMAN")
                    if (humans) {
                        for (const human of humans) {
                            const responseMessage = body;
                            const cx_id = human.connection_id
                            console.log(`Human cx_id ${cx_id}`)
                            await apiGwManagementApi.postToConnection(
                                {ConnectionId: cx_id!, Data: JSON.stringify(responseMessage),}
                            ).promise();
                        }
                    }
                } else {
                    const machines = await scanByConnectionType("AI")
                    if (machines) {
                        for (const machine of machines) {
                            const responseMessage = body;
                            const cx_id = machine.connection_id
                            console.log(`Machine cx_id ${cx_id}`)
                            await apiGwManagementApi.postToConnection(
                                {ConnectionId: cx_id!, Data: JSON.stringify(responseMessage),}
                            ).promise();
                        }
                    }
                }
            }

        }
        else {
            return {statusCode: 400, body: `unexpected route: ${event.requestContext.routeKey}`}
        }

        return { statusCode: 200, body: "Message sent" };
    } catch (error) {
        console.error("Error sending message:", error);
        return { statusCode: 500, body: "Failed to process message" };
    }
};