angular.module('app', [])


angular.module('app')
    .controller('mainController', ['$scope', '$http', function($scope, $http){
        $scope.chatMessage = ''
        $scope.loggedInUsers = []
        $scope.messageHistory = []

        $http({
            method : 'GET',
            url    : '/api/me',
        }).then(function(returnData){
            console.log(returnData)
            if ( returnData.data.user ) {
                $scope.user = returnData.data.user
            }
        })

        // calling `io()` fires the `connection` event on the server
        var socket = io()
        socket.on('loggedInUsers', function(data){

            $scope.loggedInUsers = data
            
            $scope.$apply()
            console.log(data)
        })
        socket.on('chatMessage', function(data){
            console.log('chat message? ', data)
            $scope.messageHistory.push(data)
            $scope.$apply()
        })
        socket.on('whisper', function(data){
            console.log(data.sender + ': ' + data.content)
        })

        $scope.sendMessage = function(event){
            if ( event.which === 13 ) {
                if ( $scope.chatMessage[0] != '/' ) {
                    socket.emit('chatMessage', $scope.chatMessage)
                }
                else {
                    var recipient = $scope.chatMessage.split(' ')[0].slice(1)
                    var content   = $scope.chatMessage.split(' ').slice(1).join(' ')
                    // var recipient = $scope.chatMessage
                    socket.emit('whisper', {
                        recipient:recipient,
                        content:content
                    })
                }
                $scope.chatMessage = ''
            }
        }
    }])